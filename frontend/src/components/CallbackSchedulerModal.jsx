import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Calendar, Clock, Phone } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_API_URL;

export default function CallbackSchedulerModal({ isOpen, onClose, lead, onScheduled, onSkip }) {
    const [date, setDate] = useState('');
    const [time, setTime] = useState('10:00');
    const [googleConnected, setGoogleConnected] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [callbackNote, setCallbackNote] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Set default date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            setDate(tomorrow.toISOString().split('T')[0]);
            setTime('10:00');
            setCallbackNote('');
            
            // Check Google status
            const checkGoogle = async () => {
                try {
                    const res = await axios.get(`${API_URL}/api/auth/google/status`, { withCredentials: true });
                    setGoogleConnected(res.data.connected);
                } catch (e) {}
            };
            checkGoogle();
        }
    }, [isOpen]);

    const handleSchedule = async () => {
        if (!date || !time) return;
        setIsSubmitting(true);
        try {
            const datetimeStr = `${date}T${time}:00+05:30`;
            await axios.patch(`${API_URL}/api/leads/${lead._id || lead.id}`, {
                category: "Callback",
                followUpDate: datetimeStr,
                callbackNote: callbackNote || null
            }, { withCredentials: true });
            
            if (callbackNote) {
                await axios.post(`${API_URL}/api/leads/${lead._id || lead.id}/notes`, {
                    text: `Callback scheduled for ${date} at ${time} — ${callbackNote}`,
                    source: "system"
                }, { withCredentials: true });
            }
            
            if (googleConnected) {
                toast.success(`Callback scheduled for ${date} at ${time}! Added to Google Calendar ✓`);
            } else {
                toast.success(`Callback scheduled for ${date} at ${time}!`);
            }
            if (onScheduled) onScheduled();
            onClose();
        } catch (e) {
            toast.error("Failed to schedule callback");
        }
        setIsSubmitting(false);
    };

    const handleSkip = async () => {
        setIsSubmitting(true);
        try {
            await axios.patch(`${API_URL}/api/leads/${lead._id || lead.id}`, {
                category: "Callback"
            }, { withCredentials: true });
            if (onSkip) onSkip();
            onClose();
        } catch (e) {
            toast.error("Failed to update category");
        }
        setIsSubmitting(false);
    };

    if (!lead) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl">Schedule Callback — {lead.companyName}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-1">
                        <Phone size={14} />
                        {lead.phone || 'No phone number'}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                                <Input 
                                    type="date" 
                                    value={date} 
                                    onChange={(e) => setDate(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Time</Label>
                            <div className="relative">
                                <Clock className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                                <Input 
                                    type="time" 
                                    value={time} 
                                    onChange={(e) => setTime(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                    </div>
                    
                    <p className="text-sm text-gray-500">Duration: 30 minutes</p>
                    
                    {googleConnected ? (
                        <p className="text-sm text-green-600 flex items-center gap-1">
                            📅 This will be added to your Google Calendar
                        </p>
                    ) : (
                        <p className="text-sm text-gray-400">
                            Connect Google Calendar in Settings to get reminders
                        </p>
                    )}
                    
                    <div className="space-y-2 mt-2">
                        <Label className="text-xs text-gray-500">Callback Note (Optional)</Label>
                        <Textarea 
                            placeholder="What is this callback about?" 
                            value={callbackNote}
                            onChange={(e) => setCallbackNote(e.target.value)}
                            className="resize-none text-sm"
                            rows={2}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                    <Button 
                        onClick={handleSchedule} 
                        disabled={isSubmitting || !date || !time}
                        className="w-full bg-[#E8536A] hover:bg-[#D43D54] text-white"
                    >
                        Schedule Callback
                    </Button>
                    <Button 
                        onClick={handleSkip}
                        disabled={isSubmitting}
                        variant="outline" 
                        className="w-full"
                    >
                        Skip for now
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
