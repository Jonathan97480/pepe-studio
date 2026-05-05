import { useRef, useState } from "react";

// Web Speech API non standardisée — on déclare le type vendeur proprement
interface SpeechRecognitionWindow extends Window {
    SpeechRecognition?: typeof SpeechRecognition;
    webkitSpeechRecognition?: typeof SpeechRecognition;
}

type UseVoiceResult = {
    isListening: boolean;
    isSpeaking: boolean;
    ttsEnabled: boolean;
    setTtsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
    speakText: (text: string) => void;
    handleMic: (onTranscript: (text: string) => void) => void;
    stopListening: () => void;
    stopSpeaking: () => void;
};

export function useVoice(): UseVoiceResult {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(false);
    const recognitionRef = useRef<{ stop: () => void } | null>(null);

    const speakText = (text: string) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "fr-FR";
        const voices = window.speechSynthesis.getVoices();
        const frVoice = voices.find((v) => v.lang.startsWith("fr"));
        if (frVoice) utterance.voice = frVoice;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
    };

    const stopSpeaking = () => {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
    };

    const stopListening = () => {
        recognitionRef.current?.stop();
        setIsListening(false);
    };

    const handleMic = (onTranscript: (text: string) => void) => {
        if (isListening) {
            stopListening();
            return;
        }
        const w = window as SpeechRecognitionWindow;
        const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
        if (!SR) return;
        const rec = new SR();
        rec.lang = "fr-FR";
        rec.continuous = false;
        rec.interimResults = false;
        rec.onresult = (e: SpeechRecognitionEvent) => {
            const transcript = (e.results[0][0].transcript as string).trim();
            onTranscript(transcript);
            setIsListening(false);
        };
        rec.onerror = () => setIsListening(false);
        rec.onend = () => setIsListening(false);
        recognitionRef.current = rec;
        rec.start();
        setIsListening(true);
    };

    return {
        isListening,
        isSpeaking,
        ttsEnabled,
        setTtsEnabled,
        speakText,
        handleMic,
        stopListening,
        stopSpeaking,
    };
}
