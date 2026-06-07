from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
from groq import Groq
from dotenv import load_dotenv
import os, json, re, tempfile
import yt_dlp
import whisper

load_dotenv()
client = Groq(api_key=os.getenv("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"))
whisper_model = whisper.load_model("base")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SummarizeRequest(BaseModel):
    video_id: str

class ChatRequest(BaseModel):
    video_id: str
    message: str
    history: list = []
    transcript: str = ""

class StudyRequest(BaseModel):
    transcript: str

def get_transcript_with_timestamps(video_id):
    try:
        fetcher = YouTubeTranscriptApi()
        data = fetcher.fetch(video_id, languages=['en', 'hi', 'te', 'kn', 'en-IN'])
        chunks = []
        chunk_text = ""
        chunk_start = 0
        for i, entry in enumerate(data):
            chunk_text += " " + entry.text
            if (i + 1) % 20 == 0 or i == len(data) - 1:
                mins = int(chunk_start // 60)
                secs = int(chunk_start % 60)
                chunks.append({
                    "timestamp": f"{mins:02d}:{secs:02d}",
                    "text": chunk_text.strip()
                })
                chunk_text = ""
                if i + 1 < len(data):
                    chunk_start = data[i + 1].start
        return chunks
    except Exception:
        return None

def get_transcript_via_whisper(video_id):
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, "audio.mp3")
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(tmpdir, 'audio.%(ext)s'),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
            }],
            'quiet': True,
            'ffmpeg_location': r'C:\Users\VARSHINI\Downloads\ffmpeg\ffmpeg-master-latest-win64-gpl-shared\bin'
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
        result = whisper_model.transcribe(audio_path, word_timestamps=False)
        chunks = []
        for seg in result["segments"]:
            mins = int(seg["start"] // 60)
            secs = int(seg["start"] % 60)
            chunks.append({
                "timestamp": f"{mins:02d}:{secs:02d}",
                "text": seg["text"].strip()
            })
        return chunks

def split_into_time_chunks(chunks, minutes_per_chunk=10):
    time_chunks = []
    current = []
    current_start_mins = 0
    for c in chunks:
        parts = c["timestamp"].split(":")
        mins = int(parts[0])
        if not current:
            current_start_mins = mins
        if mins - current_start_mins >= minutes_per_chunk and current:
            time_chunks.append(current)
            current = []
            current_start_mins = mins
        current.append(c)
    if current:
        time_chunks.append(current)
    return time_chunks

def generate_chapters_for_chunk(chunk_text):
    prompt = f"""
You are a YouTube video chapter generator. Given this timestamped transcript chunk, return ONLY a JSON array with no markdown:
[
  {{"timestamp": "MM:SS", "title": "Chapter title", "description": "1-2 sentence description"}}
]
Use the EXACT timestamps from the transcript. Generate a chapter for every major topic change.

Transcript:
{chunk_text[:5000]}
"""
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        text = re.sub(r"```json|```", "", text).strip()
        return json.loads(text)
    except:
        return []

def generate_overall_summary(full_transcript):
    prompt = f"""
Given this YouTube video transcript, return ONLY a JSON object with no markdown:
{{
  "summary": "2-3 sentence overview of the entire video",
  "worth_watching": "One sentence on who should watch this and why"
}}

Transcript:
{full_transcript[:5000]}
"""
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        text = re.sub(r"```json|```", "", text).strip()
        return json.loads(text)
    except:
        return {"summary": "Summary unavailable.", "worth_watching": ""}

@app.post("/summarize")
async def summarize(req: SummarizeRequest):
    chunks = get_transcript_with_timestamps(req.video_id)
    if not chunks:
        try:
            chunks = get_transcript_via_whisper(req.video_id)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not fetch transcript: {str(e)}")

    full_transcript = "\n".join([f"[{c['timestamp']}] {c['text']}" for c in chunks])
    time_chunks = split_into_time_chunks(chunks, minutes_per_chunk=10)

    all_chapters = []
    for tc in time_chunks:
        chunk_text = "\n".join([f"[{c['timestamp']}] {c['text']}" for c in tc])
        chapters = generate_chapters_for_chunk(chunk_text)
        all_chapters.extend(chapters)

    overall = generate_overall_summary(full_transcript)

    return {
        "summary": overall.get("summary", ""),
        "worth_watching": overall.get("worth_watching", ""),
        "chapters": all_chapters,
        "transcript": full_transcript
    }

@app.post("/chat")
async def chat(req: ChatRequest):
    prompt = f"""You are a helpful assistant that answers questions about a YouTube video.
Use this transcript to answer accurately and reference timestamps when relevant:

{req.transcript[:6000]}

Conversation so far:
{chr(10).join([f"{m['role'].upper()}: {m['content']}" for m in req.history])}

USER: {req.message}
ASSISTANT:"""
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
        )
        return {"reply": response.choices[0].message.content.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/study")
async def study(req: StudyRequest):
    prompt = f"""
IMPORTANT: The answer field must exactly match one of the options including the letter prefix like "A. For Loop"
You are a study assistant. Given this video transcript, return ONLY a JSON object with no markdown:
{{
  "flashcards": [
    {{"term": "Term or concept", "definition": "Clear explanation"}},
    {{"term": "Term or concept", "definition": "Clear explanation"}}
  ],
  "mcqs": [
    {{
      "question": "Question here?",
      "options": ["A. option1", "B. option2", "C. option3", "D. option4"],
      "answer": "A. option1"
    }}
  ]
}}
Generate 5 flashcards and 3 MCQs from the content.
IMPORTANT: The answer field must be an EXACT copy of one of the options including the letter prefix.

Transcript:
{req.transcript[:6000]}
"""
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content.strip()
        text = re.sub(r"```json|```", "", text).strip()
        return json.loads(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))