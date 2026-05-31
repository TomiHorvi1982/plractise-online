import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';

interface ChatMessage {
  id: string;
  from: string;
  username: string;
  text: string;
  timestamp: number;
}

interface AudioMessage {
  id: string;
  from: string;
  username: string;
  audioBuffer: ArrayBuffer;
  duration: number;
  timestamp: number;
}

interface FileShareData {
  id: string;
  from: string;
  username: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData: ArrayBuffer;
  timestamp: number;
}

interface ChatProps {
  socket: Socket;
  roomId: string;
  username: string;
}

export default function Chat({ socket, roomId, username }: ChatProps) {
  const [messages, setMessages] = useState<(ChatMessage | AudioMessage | FileShareData)[]>([]);
  const [input, setInput] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleChat = (msg: ChatMessage) => setMessages((prev) => [...prev, msg]);
    const handleAudioMsg = (msg: AudioMessage) => setMessages((prev) => [...prev, msg]);
    const handleFile = (file: FileShareData) => setMessages((prev) => [...prev, file]);

    socket.on('chat-message', handleChat);
    socket.on('audio-message', handleAudioMsg);
    socket.on('file-share', handleFile);

    return () => {
      socket.off('chat-message', handleChat);
      socket.off('audio-message', handleAudioMsg);
      socket.off('file-share', handleFile);
    };
  }, [socket]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    socket.emit('chat-message', { text: input.trim() });
    setInput('');
    inputRef.current?.focus();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
        const buffer = await blob.arrayBuffer();
        const duration = recordingDuration;
        socket.emit('audio-message', { audioBuffer: buffer, duration });
        stream.getTracks().forEach((t) => t.stop());
        setRecordingDuration(0);
      };

      recorder.start(100);
      setRecording(true);

      let elapsed = 0;
      timerRef.current = window.setInterval(() => {
        elapsed += 0.1;
        setRecordingDuration(elapsed);
        if (elapsed >= 30) stopRecording();
      }, 100);
    } catch (err) {
      console.error('[chat] recording failed:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    clearInterval(timerRef.current);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert('File too large (max 50MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      socket.emit('file-share', {
        fileName: file.name,
        fileData: arrayBuffer,
        fileType: file.type,
        fileSize: file.size,
      }, (success: boolean) => {
        if (!success) alert('Failed to send file');
      });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const playAudioMessage = (buffer: ArrayBuffer) => {
    if (audioRef.current) audioRef.current.pause();
    const blob = new Blob([buffer], { type: 'audio/webm;codecs=opus' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play();
  };

  const downloadFile = (data: FileShareData) => {
    const blob = new Blob([data.fileData], { type: data.fileType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDuration = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="chat" role="tabpanel" aria-label="Chat">
      <div className="chat-messages" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && (
          <div className="msg-empty" role="status">
            <p>No messages yet</p>
            <p className="hint">Start a conversation or send an audio message</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-msg ${msg.from === socket.id ? 'own' : ''}`}
            role="article"
          >
            <div className="msg-header">
              <span className="msg-user">{msg.username}</span>
              <span className="msg-time">{formatTime(msg.timestamp)}</span>
            </div>
            {'text' in msg && (
              <p className="msg-text">{msg.text}</p>
            )}
            {'duration' in msg && 'audioBuffer' in msg && (
              <div className="msg-audio">
                <button
                  className="btn-xs btn-secondary"
                  onClick={() => playAudioMessage(msg.audioBuffer)}
                  aria-label={`Play audio message from ${msg.username}, duration ${formatDuration(msg.duration)}`}
                >
                  Play ({formatDuration(msg.duration)})
                </button>
              </div>
            )}
            {'fileName' in msg && (
              <div className="msg-file">
                <span className="file-name" title={msg.fileName}>{msg.fileName}</span>
                <span className="file-size">{formatBytes(msg.fileSize)}</span>
                <button
                  className="btn-xs btn-secondary"
                  onClick={() => downloadFile(msg)}
                  aria-label={`Download ${msg.fileName}`}
                >
                  Download
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-tools">
        <button
          className={`btn-sm ${recording ? 'btn-danger' : 'btn-secondary'}`}
          onClick={recording ? stopRecording : startRecording}
          aria-label={recording ? 'Stop recording' : 'Record audio message'}
        >
          {recording ? `Stop (${formatDuration(recordingDuration)})` : 'Record Audio'}
        </button>
        <button
          className="btn-sm btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Send file"
        >
          Send File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFileSelect}
          aria-hidden="true"
        />
      </div>

      <form className="chat-input" onSubmit={sendMessage} aria-label="Chat message form">
        <label htmlFor="chat-input-field" className="sr-only">Message</label>
        <input
          id="chat-input-field"
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          maxLength={2000}
          autoComplete="off"
        />
        <button type="submit" disabled={!input.trim()} aria-label="Send message">
          Send
        </button>
      </form>
    </div>
  );
}
