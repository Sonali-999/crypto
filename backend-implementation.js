// server.js - Express server setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const schedule = require('node-schedule');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Twilio configuration
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// Database models
const doctorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    specialty: { type: String, required: true },
    availability: [{ type: Date }],
    currentToken: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
});

const appointmentSchema = new mongoose.Schema({
    patientName: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    appointmentDate: { type: Date, required: true },
    tokenNumber: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['waiting', 'notified', 'serving', 'completed', 'cancelled'],
        default: 'waiting'
    },
    createdAt: { type: Date, default: Date.now }
});

const Doctor = mongoose.model('Doctor', doctorSchema);
const Appointment = mongoose.model('Appointment', appointmentSchema);

// Routes
app.get('/api/doctors', async (req, res) => {
    try {
        const doctors = await Doctor.find({ isActive: true });
        res.json(doctors);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching doctors', error: error.message });
    }
});

app.post('/api/appointments', async (req, res) => {
    try {
        const { patientName, mobileNumber, doctorId, appointmentDate } = req.body;
        
        // Find the doctor
        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }
        
        // Generate token number (increment the doctor's current token)
        const tokenNumber = doctor.currentToken + 1;
        
        // Create the appointment
        const appointment = new Appointment({
            patientName,
            mobileNumber,
            doctor: doctorId,
            appointmentDate: new Date(appointmentDate),
            tokenNumber
        });
        
        // Save the appointment
        await appointment.save();
        
        // Update the doctor's current token
        doctor.currentToken = tokenNumber;
        await doctor.save();
        
        // Schedule the queue processing job
        scheduleQueueProcessing(doctorId);
        
        res.status(201).json({ 
            message: 'Appointment created successfully',
            tokenNumber,
            currentToken: doctor.currentToken - tokenNumber,
            estimatedWaitTime: (doctor.currentToken - tokenNumber) * 15 // Assuming 15 minutes per patient
        });
    } catch (error) {
        res.status(500).json({ message: 'Error creating appointment', error: error.message });
    }
});

app.get('/api/queue-status/:doctorId', async (req, res) => {
    try {
        const { doctorId } = req.params;
        
        // Find the doctor
        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }
        
        // Get the current appointment being served
        const currentAppointment = await Appointment.findOne({
            doctor: doctorId,
            status: 'serving'
        });
        
        // Calculate waiting times for all appointments
        const waitingAppointments = await Appointment.find({
            doctor: doctorId,
            status: 'waiting'
        }).sort({ tokenNumber: 1 });
        
        // Return queue status
        res.json({
            currentToken: currentAppointment ? currentAppointment.tokenNumber : doctor.currentToken,
            queueLength: waitingAppointments.length,
            estimatedWaitTime: waitingAppointments.length * 15 // Assuming 15 minutes per patient
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching queue status', error: error.message });
    }
});

app.put('/api/appointments/:id/cancel', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Find the appointment
        const appointment = await Appointment.findById(id);
        if (!appointment) {
            return res.status(404).json({ message: 'Appointment not found' });
        }
        
        // Update appointment status
        appointment.status = 'cancelled';
        await appointment.save();
        
        res.json({ message: 'Appointment cancelled successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error cancelling appointment', error: error.message });
    }
});

// Admin routes
app.put('/api/admin/next-patient/:doctorId', async (req, res) => {
    try {
        const { doctorId } = req.params;
        
        // Find current appointment being served and mark as completed
        const currentAppointment = await Appointment.findOne({
            doctor: doctorId,
            status: 'serving'
        });
        
        if (currentAppointment) {
            currentAppointment.status = 'completed';
            await currentAppointment.save();
        }
        
        // Find next appointment in queue
        const nextAppointment = await Appointment.findOne({
            doctor: doctorId,
            status: { $in: ['waiting', 'notified'] }
        }).sort({ tokenNumber: 1 });
        
        if (!nextAppointment) {
            return res.json({ message: 'No more patients in queue' });
        }
        
        // Update next appointment status
        nextAppointment.status = 'serving';
        await nextAppointment.save();
        
        // Process the queue for notifications
        processQueue(doctorId);
        
        res.json({ 
            message: 'Next patient called',
            patient: {
                name: nextAppointment.patientName,
                tokenNumber: nextAppointment.tokenNumber
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error calling next patient', error: error.message });
    }
});

// Helper functions
async function processQueue(doctorId) {
    try {
        // Find the appointment currently being served
        const currentAppointment = await Appointment.findOne({
            doctor: doctorId,
            status: 'serving'
        });
        
        if (!currentAppointment) {
            return;
        }
        
        // Find appointments that need notification (2 positions away)
        const appointmentsToNotify = await Appointment.find({
            doctor: doctorId,
            status: 'waiting',
            tokenNumber: { $gt: currentAppointment.tokenNumber, $lte: currentAppointment.tokenNumber + 2 }
        });
        
        // Send SMS notifications
        for (const appointment of appointmentsToNotify) {
            await sendSmsNotification(
                appointment.mobileNumber,
                `MediQueue Alert: Your token number ${appointment.tokenNumber} will be called shortly. There are ${appointment.tokenNumber - currentAppointment.tokenNumber} patients ahead of you. Please proceed to the waiting area.`
            );
            
            // Update appointment status
            appointment.status = 'notified';
            await appointment.save();
        }
    } catch (error) {
        console.error('Error processing queue:', error);
    }
}

async function sendSmsNotification(phoneNumber, message) {
    try {
        await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber
        });
        console.log(`SMS sent to ${phoneNumber}`);
    } catch (error) {
        console.error('Error sending SMS:', error);
    }
}

function scheduleQueueProcessing(doctorId) {
    // Schedule queue processing every 5 minutes
    schedule.scheduleJob('*/5 * * * *', async function() {
        await processQueue(doctorId);
    });
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
