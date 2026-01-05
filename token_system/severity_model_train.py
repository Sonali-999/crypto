# severity_model_train_bert.py

import pandas as pd
import json
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import DistilBertTokenizerFast, DistilBertModel, Trainer, TrainingArguments
from transformers import BertForSequenceClassification
from sklearn.model_selection import train_test_split
import numpy as np
import joblib

# Step 1: Load dataset
with open("token_system/data/patient_severity_dataset.json", "r") as f:
    data = json.load(f)

df = pd.DataFrame(data)
df.rename(columns={"condition": "description"}, inplace=True)

# Step 2: Train/test split
train_texts, val_texts, train_labels, val_labels = train_test_split(
    df['description'], df['severity'], test_size=0.2, random_state=42
)

# Step 3: Tokenizer
tokenizer = DistilBertTokenizerFast.from_pretrained('distilbert-base-uncased')

# Step 4: Dataset class
class SeverityDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_len=64):
        self.texts = texts.tolist()
        self.labels = labels.tolist()
        self.tokenizer = tokenizer
        self.max_len = max_len
        
    def __len__(self):
        return len(self.texts)
    
    def __getitem__(self, idx):
        text = self.texts[idx]
        label = self.labels[idx]
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding='max_length',
            max_length=self.max_len,
            return_tensors='pt'
        )
        return {
            'input_ids': encoding['input_ids'].squeeze(),
            'attention_mask': encoding['attention_mask'].squeeze(),
            'labels': torch.tensor(label, dtype=torch.float)
        }

train_dataset = SeverityDataset(train_texts, train_labels, tokenizer)
val_dataset = SeverityDataset(val_texts, val_labels, tokenizer)

# Step 5: Load pretrained model for regression
from transformers import DistilBertForSequenceClassification

model = DistilBertForSequenceClassification.from_pretrained(
    'distilbert-base-uncased',
    num_labels=1,  # Regression
)

# Step 6: Training arguments
training_args = TrainingArguments(
    output_dir='./results',
    num_train_epochs=3,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    eval_strategy='epoch',   # ✅ new, replaces evaluation_strategy
    save_strategy='epoch',
    learning_rate=2e-5,
    weight_decay=0.01,
    logging_dir='./logs',
    logging_steps=5,
)

# Step 7: Define custom compute_metrics for regression
from sklearn.metrics import mean_squared_error

def compute_metrics(eval_pred):
    preds, labels = eval_pred
    preds = np.squeeze(preds)
    mse = mean_squared_error(labels, preds)
    return {'mse': mse}

# Step 8: Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    tokenizer=tokenizer,
    compute_metrics=compute_metrics
)

# Step 9: Train
trainer.train()

# Step 10: Save model and tokenizer
model.save_pretrained("token_system/severity_bert_model")
tokenizer.save_pretrained("token_system/severity_bert_tokenizer")
print("Model and tokenizer saved to token_system/ folder.")
