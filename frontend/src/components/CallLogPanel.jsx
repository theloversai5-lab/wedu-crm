import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Phone, Clock, User, Calendar, MessageSquare, Check, Send } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { ScrollArea } from './ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';

const API_URL = process.env.REACT_APP_API_URL;

const RESPONSES = [
    "Interested", "Not Interested", "Call Again 1", "Call Again 2", "Call Again 3",
    "Send Portfolio", "Portfolio Sent — Will Let Us Know", "Meeting Scheduled", "Meeting Done",
    "Time Given", "Not Answering / Voicemail", "Busy — Call Back Later", "Wrong Number",
    "Switch Off", "In Meeting — Send Details", "Low Budget", "Inhouse Team",
    "Project Follow-up", "Weekly Message Sent", "Will Let Us Know"
];

const getResponseColor = (response) => {
    const colors = {
        'Interested': 'bg-green-100 text-green-800',
        'Not Interested': 'bg-red-100 text-red-800',
        'Meeting Done': 'bg-blue-100 text-blue-800',
        'Meeting Scheduled': 'bg-purple-100 text-purple-800',
        'Call Again 1': 'bg-orange-100 text-orange-800',
        'Call Again 2': 'bg-orange-100 text-orange-800',
        'Call Again 3': 'bg-orange-100 text-orange-800',
        'Busy — Call Back Later': 'bg-yellow-100 text-yellow-800',
        'Not Answering / Voicemail': 'bg-gray-100 text-gray-700',
        'Send Portfolio': 'bg-teal-100 text-teal-800',
        'Portfolio Sent — Will Let Us Know': 'bg-teal-100 text-teal-800'
    };
    return colors[response] || 'bg-gray-100 text-gray-600';
};

export default function CallLogPanel({ lead, onClose, onUpdate, teamMembers }) {
    const [showLogForm, setShowLogForm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fullLead, setFullLead] = useState(null);
    
    // Form state
    const [response, setResponse] = useState('');
    const [notes, setNotes] = useState('');
    const [duration, setDuration] = useState('');
    const [followUpDate, setFollowUpDate] = useState('');
    const [nextFollowupTime, setNextFollowupTime] = useState('');
    const [portfolioSent, setPortfolioSent] = useState(false);
    const [priceListSent, setPriceListSent] = useState(false);
    const [waSent, setWaSent] = useState(false);
    const [waNumberUsed, setWaNumberUsed] = useState(1);

    useEffect(() => {
        const fetchFullLead = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/leads/${lead.id}`, { withCredentials: true });
                setFullLead(res.data);
            } catch (err) {
                console.error('Error fetching lead:', err);
            }
        };
        fetchFullLead();
    }, [lead.id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!response) return;

        setLoading(true);
        try {
            let followupDateTime = null;
            if (followUpDate) {
                followupDateTime = nextFollowupTime 
                    ? `${followUpDate}T${nextFollowupTime}:00`
                    : `${followUpDate}T10:00:00`;
            }

            await axios.post(`${API_URL}/api/leads/${lead.id}/response`, {
                response,
                notes,
                duration: duration ? parseInt(duration) : null,
                followUpDate: followupDateTime,
                portfolioSent,
                priceListSent,
                waSent,
                waNumberUsed
            }, { withCredentials: true });

            // Reset form
            setResponse('');
            setNotes('');
            setDuration('');
            setFollowUpDate('');
            setNextFollowupTime('');
            setPortfolioSent(false);
            setPriceListSent(false);
            setWaSent(false);
            setShowLogForm(false);
            
            // Refresh data
            const res = await axios.get(`${API_URL}/api/leads/${lead.id}`, { withCredentials: true });
            setFullLead(res.data);
            onUpdate();
        } catch (err) {
            console.error('Error logging call:', err);
        } finally {
            setLoading(false);
        }
    };

    const responseHistory = fullLead?.responseHistory || [];
    const lastContact = fullLead?.lastContactDate 
        ? new Date(fullLead.lastContactDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Never';

    return (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200" data-testid="call-log-panel">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-heading text-lg font-semibold text-gray-900">{lead.companyName}</h2>
                        <p className="text-[12px] text-gray-500">{lead.phone || 'No phone'}</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        data-testid="close-call-log"
                    >
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>
                <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-[12px]">
                        <Phone size={12} className="text-blue-500" />
                        <span className="font-medium text-blue-600">{fullLead?.callCount || 0} Calls Total</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
                        <Clock size={12} />
                        <span>Last: {lastContact}</span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                    {/* Log New Call Button */}
                    {!showLogForm && (
                        <Button
                            onClick={() => setShowLogForm(true)}
                            className="w-full bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[10px]"
                            data-testid="log-new-call-btn"
                        >
                            <Phone size={14} className="mr-2" />
                            Log New Call
                        </Button>
                    )}

                    {/* Log Form */}
                    {showLogForm && (
                        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-[12px] p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-heading text-sm font-medium">Log New Call</h3>
                                <button 
                                    type="button" 
                                    onClick={() => setShowLogForm(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[11px]">Response *</Label>
                                <Select value={response} onValueChange={setResponse} required>
                                    <SelectTrigger className="h-9 text-[12px] rounded-[8px]" data-testid="response-select">
                                        <SelectValue placeholder="Select response" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {RESPONSES.map(r => (
                                            <SelectItem key={r} value={r}>{r}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[11px]">Notes</Label>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Add notes..."
                                    className="text-[12px] rounded-[8px] min-h-[60px]"
                                    data-testid="notes-input"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label className="text-[11px]">Duration (mins)</Label>
                                    <Input
                                        type="number"
                                        value={duration}
                                        onChange={(e) => setDuration(e.target.value)}
                                        placeholder="5"
                                        className="h-9 text-[12px] rounded-[8px]"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px]">WA Number Used</Label>
                                    <Select value={String(waNumberUsed)} onValueChange={(v) => setWaNumberUsed(Number(v))}>
                                        <SelectTrigger className="h-9 text-[12px] rounded-[8px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">WhatsApp 1</SelectItem>
                                            <SelectItem value="2">WhatsApp 2</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label className="text-[11px]">Follow-up Date</Label>
                                    <Input
                                        type="date"
                                        value={followUpDate}
                                        onChange={(e) => setFollowUpDate(e.target.value)}
                                        className="h-9 text-[12px] rounded-[8px]"
                                        data-testid="followup-date-input"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[11px]">Time</Label>
                                    <Input
                                        type="time"
                                        value={nextFollowupTime}
                                        onChange={(e) => setNextFollowupTime(e.target.value)}
                                        className="h-9 text-[12px] rounded-[8px]"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-1.5 text-[11px]">
                                    <Checkbox checked={portfolioSent} onCheckedChange={setPortfolioSent} className="h-4 w-4" />
                                    Portfolio Sent
                                </label>
                                <label className="flex items-center gap-1.5 text-[11px]">
                                    <Checkbox checked={priceListSent} onCheckedChange={setPriceListSent} className="h-4 w-4" />
                                    Price List Sent
                                </label>
                                <label className="flex items-center gap-1.5 text-[11px]">
                                    <Checkbox checked={waSent} onCheckedChange={setWaSent} className="h-4 w-4" />
                                    WA Sent
                                </label>
                            </div>

                            <Button
                                type="submit"
                                disabled={!response || loading}
                                className="w-full bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[10px]"
                                data-testid="save-call-btn"
                            >
                                {loading ? 'Saving...' : 'Save Call Log'}
                            </Button>
                        </form>
                    )}

                    {/* Response History */}
                    <div className="space-y-3">
                        <h3 className="font-heading text-sm font-medium text-gray-700">Call History</h3>
                        {responseHistory.length === 0 ? (
                            <p className="text-[12px] text-gray-400 text-center py-4">No call history yet</p>
                        ) : (
                            [...responseHistory].reverse().map((entry, idx) => {
                                const member = teamMembers?.find(m => m.id === entry.teamMember);
                                const date = entry.timestamp 
                                    ? new Date(entry.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                    : 'Unknown';
                                
                                return (
                                    <div key={`${entry.timestamp}-${entry.response}-${idx}`} className="bg-white border border-gray-100 rounded-[10px] p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${getResponseColor(entry.response)}`}>
                                                {entry.response}
                                            </span>
                                            <span className="text-[10px] text-gray-400">{date}</span>
                                        </div>
                                        {entry.notes && (
                                            <p className="text-[11px] text-gray-600">{entry.notes}</p>
                                        )}
                                        <div className="flex items-center gap-3 text-[10px] text-gray-500">
                                            {member && (
                                                <span className="flex items-center gap-1">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: member.color }} />
                                                    {member.name}
                                                </span>
                                            )}
                                            {entry.duration && (
                                                <span className="flex items-center gap-1">
                                                    <Clock size={10} />
                                                    {entry.duration} min
                                                </span>
                                            )}
                                            {entry.waNumberUsed && (
                                                <span>WA{entry.waNumberUsed}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {entry.portfolioSent && <span className="text-[9px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">Portfolio</span>}
                                            {entry.priceListSent && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Price List</span>}
                                            {entry.waSent && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">WA Sent</span>}
                                        </div>
                                        {entry.followUpDate && (
                                            <span className="text-[11px] text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-200">
                                                Next: {new Date(entry.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
