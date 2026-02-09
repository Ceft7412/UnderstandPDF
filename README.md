# UnderstandPDF

A web application that lets users upload PDF documents and instantly see AI-generated insights extracted from them. Instead of reading long documents, users can browse AI-generated cards summarizing key points with source citations while viewing the PDF side by side.

## 🚀 Features

- **PDF Upload** - Upload any PDF document for processing
- **AI-Generated Insights** - Automatically extract key insights as cards with titles, descriptions, and source citations
- **Two-Pane Interface** - PDF viewer on left, insights sidebar on right
- **Interactive Citations** - Click page references in insights to navigate PDF

## 🔧 Key Components

### PDF Processing Flow

1. **Upload** - User uploads PDF via drag-and-drop
2. **Processing** - Async background processing: text extraction → chunking → embeddings → vector indexing
3. **Insights Generation** - AI extracts key insights with citations

## RAG Architecture

This project implements **Retrieval-Augmented Generation (RAG)** to provide accurate, citation-backed answers from PDF documents:

1. **Document Chunking** - PDFs are split into semantic chunks (typically 200-300 words) to balance context and retrieval efficiency
2. **Vector Embeddings** - Each chunk is converted to a vector embedding using Gemini API
3. **Vector Storage** - Embeddings stored in Supabase PostgreSQL with pgvector extension
4. **Semantic Search** - When users ask questions, the system:
   - Generates query embedding
   - Performs vector similarity search (cosine similarity)
   - Retrieves top-K most relevant chunks (typically 5-10)
5. **Context Assembly** - Retrieved chunks are combined with the user's question
6. **LLM Processing** - Gemini API generates answers using the assembled context
7. **Citation Mapping** - The system tracks which chunks were used to generate each answer, providing page-level citations

### Benefits of RAG Approach

- **Accuracy**: Answers are grounded in actual document content
- **Cost Efficiency**: Only relevant context is sent to the LLM, reducing token usage
- **Citation Tracking**: Every answer can be traced back to specific document pages
- **Scalability**: Vector search scales efficiently with document size
- **Privacy**: Documents never leave the user's account context

### Vector Search Implementation

- **Similarity Metric**: Cosine similarity for semantic matching
- **Search Scope**: Scoped to individual documents to prevent cross-document leakage
- **Performance**: Optimized for fast retrieval (sub-second response times)
- **Relevance Ranking**: Results ordered by similarity score

## 🚀 Getting Started

1. **Clone the repository**
2. **Set up environment variables** using `.env.example`
3. **Install dependencies**: `npm install`
4. **Run locally**: `npm run dev`
5. **Build for production**: `npm run build`

## 📄 License

This project is for educational purposes. Please check individual dependencies for their respective licenses.

---

**Built with ❤️ using Next.js, Supabase, and Gemini**
