# severity.py

import torch
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

class SeverityScorer:
    def __init__(self, model_path="token_system/severity_bert_model",
                 tokenizer_path="token_system/severity_bert_tokenizer",
                 device=None):
        # Use GPU if available, else CPU
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        
        # Load tokenizer and model
        self.tokenizer = DistilBertTokenizerFast.from_pretrained(tokenizer_path)
        self.model = DistilBertForSequenceClassification.from_pretrained(model_path)
        self.model.to(self.device)
        self.model.eval()  # set to evaluation mode

    def predict(self, text: str, max_length=64) -> float:
        """
        Predict severity score for a single patient description.
        Returns a float severity (0-10 scale or whatever your dataset used).
        """
        with torch.no_grad():
            inputs = self.tokenizer(
                text,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=max_length
            ).to(self.device)

            outputs = self.model(**inputs)
            score = outputs.logits.squeeze().item()
        
        # Optional: clamp score between 0 and 10
        score = max(0.0, min(10.0, score))
        return score


# Example usage
if __name__ == "__main__":
    scorer = SeverityScorer()
    description = "I've been feeling really hot and shivery, body aches all over, can't sleep at night"
    severity = scorer.predict(description)
    print(f"Predicted severity: {severity:.2f}")
