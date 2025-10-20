from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import json
import re
from docx import Document
import PyPDF2
from openai import OpenAI
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

app = Flask(__name__)
CORS(app)

# Configuração do OpenAI
client = OpenAI()

class DocumentProcessor:
    def __init__(self):
        self.documents = []
        self.vectorizer = TfidfVectorizer(stop_words=None, max_features=1000)
        self.document_vectors = None
        self.processed = False
    
    def extract_text_from_pdf(self, file_path):
        """Extrai texto de arquivo PDF"""
        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
                return text
        except Exception as e:
            print(f"Erro ao processar PDF {file_path}: {e}")
            return ""
    
    def extract_text_from_docx(self, file_path):
        """Extrai texto de arquivo DOCX"""
        try:
            doc = Document(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text
        except Exception as e:
            print(f"Erro ao processar DOCX {file_path}: {e}")
            return ""
    
    def extract_text_from_doc(self, file_path):
        """Extrai texto de arquivo DOC (limitado)"""
        # Para arquivos DOC antigos, seria necessário usar python-docx2txt ou outra biblioteca
        # Por simplicidade, retornamos uma mensagem informativa
        return "Arquivo DOC detectado. Para melhor suporte, converta para DOCX ou PDF."
    
    def clean_text(self, text):
        """Limpa e normaliza o texto"""
        # Remove quebras de linha excessivas
        text = re.sub(r'\n+', '\n', text)
        # Remove espaços extras
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
    
    def chunk_text(self, text, chunk_size=500, overlap=50):
        """Divide o texto em chunks menores para melhor processamento"""
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk = ' '.join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk)
        
        return chunks
    
    def process_documents(self, documents_folder="documents"):
        """Processa todos os documentos na pasta especificada"""
        self.documents = []
        
        if not os.path.exists(documents_folder):
            os.makedirs(documents_folder)
            return
        
        for filename in os.listdir(documents_folder):
            file_path = os.path.join(documents_folder, filename)
            
            if not os.path.isfile(file_path):
                continue
            
            text = ""
            file_ext = filename.lower().split('.')[-1]
            
            if file_ext == 'pdf':
                text = self.extract_text_from_pdf(file_path)
            elif file_ext == 'docx':
                text = self.extract_text_from_docx(file_path)
            elif file_ext == 'doc':
                text = self.extract_text_from_doc(file_path)
            elif file_ext == 'txt':
                with open(file_path, 'r', encoding='utf-8') as f:
                    text = f.read()
            
            if text:
                cleaned_text = self.clean_text(text)
                chunks = self.chunk_text(cleaned_text)
                
                for i, chunk in enumerate(chunks):
                    self.documents.append({
                        'filename': filename,
                        'chunk_id': i,
                        'text': chunk,
                        'source': f"{filename} (parte {i+1})"
                    })
        
        # Criar vetores TF-IDF dos documentos
        if self.documents:
            texts = [doc['text'] for doc in self.documents]
            self.document_vectors = self.vectorizer.fit_transform(texts)
            self.processed = True
            print(f"Processados {len(self.documents)} chunks de {len(set([doc['filename'] for doc in self.documents]))} documentos")
    
    def find_relevant_chunks(self, query, top_k=3):
        """Encontra os chunks mais relevantes para a consulta"""
        if not self.processed or not self.documents:
            return []
        
        # Vetorizar a consulta
        query_vector = self.vectorizer.transform([query])
        
        # Calcular similaridade
        similarities = cosine_similarity(query_vector, self.document_vectors).flatten()
        
        # Obter os top_k mais similares
        top_indices = np.argsort(similarities)[-top_k:][::-1]
        
        relevant_chunks = []
        for idx in top_indices:
            if similarities[idx] > 0.1:  # Threshold mínimo de similaridade
                relevant_chunks.append({
                    'text': self.documents[idx]['text'],
                    'source': self.documents[idx]['source'],
                    'similarity': float(similarities[idx])
                })
        
        return relevant_chunks

# Instância global do processador
doc_processor = DocumentProcessor()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process_documents', methods=['POST'])
def process_documents():
    """Endpoint para processar documentos"""
    try:
        doc_processor.process_documents()
        return jsonify({
            'success': True,
            'message': f'Processados {len(doc_processor.documents)} chunks de documentos',
            'document_count': len(set([doc['filename'] for doc in doc_processor.documents]))
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Erro ao processar documentos: {str(e)}'
        })

@app.route('/chat', methods=['POST'])
def chat():
    """Endpoint principal do chat"""
    try:
        data = request.get_json()
        user_question = data.get('question', '').strip()
        
        if not user_question:
            return jsonify({
                'success': False,
                'message': 'Pergunta não pode estar vazia'
            })
        
        if not doc_processor.processed:
            return jsonify({
                'success': False,
                'message': 'Documentos não foram processados. Execute o processamento primeiro.'
            })
        
        # Encontrar chunks relevantes
        relevant_chunks = doc_processor.find_relevant_chunks(user_question, top_k=3)
        
        if not relevant_chunks:
            return jsonify({
                'success': True,
                'answer': 'Desculpe, não encontrei informações relevantes nos documentos fornecidos para responder sua pergunta.',
                'sources': []
            })
        
        # Preparar contexto para o LLM
        context = "\n\n".join([f"Fonte: {chunk['source']}\nConteúdo: {chunk['text']}" for chunk in relevant_chunks])
        
        # Prompt para o LLM
        system_prompt = """Você é um assistente especializado em documentos de condomínio. 
        Responda APENAS com base nas informações fornecidas no contexto abaixo. 
        Se a informação não estiver no contexto, diga que não encontrou a informação nos documentos.
        Seja preciso, claro e cite as fontes quando possível.
        Responda em português brasileiro."""
        
        user_prompt = f"""Contexto dos documentos:
        {context}
        
        Pergunta: {user_question}
        
        Resposta:"""
        
        # Chamar o LLM
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            max_tokens=500,
            temperature=0.1
        )
        
        answer = response.choices[0].message.content
        sources = [chunk['source'] for chunk in relevant_chunks]
        
        return jsonify({
            'success': True,
            'answer': answer,
            'sources': sources
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Erro ao processar pergunta: {str(e)}'
        })

@app.route('/status', methods=['GET'])
def status():
    """Endpoint para verificar status do sistema"""
    documents_folder = "documents"
    files_in_folder = []
    
    if os.path.exists(documents_folder):
        files_in_folder = [f for f in os.listdir(documents_folder) if os.path.isfile(os.path.join(documents_folder, f))]
    
    return jsonify({
        'processed': doc_processor.processed,
        'document_count': len(set([doc['filename'] for doc in doc_processor.documents])) if doc_processor.documents else 0,
        'chunk_count': len(doc_processor.documents),
        'files_in_folder': files_in_folder
    })

if __name__ == '__main__':
    # Processar documentos na inicialização
    print("Iniciando processamento de documentos...")
    doc_processor.process_documents()
    
    app.run(debug=False, host='0.0.0.0', port=5000)
