import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { 
    ArrowLeft, Phone, Mail, Instagram, MessageCircle, 
    Calendar, Clock, Edit2, Trash2, Check, X, ExternalLink,
    Send, User, AlertTriangle, Globe
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Checkbox } from '../components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import CallLogPanel from '../components/CallLogPanel';
import CallbackSchedulerModal from '../components/CallbackSchedulerModal';

const API_URL = process.env.REACT_APP_API_URL;

const WA_NUMBERS = [
    { value: '5235', label: '...5235' },
    { value: '5533', label: '...5533' },
    { value: '0951', label: '...0951' },
];

const CATEGORIES = [
    'Meeting Done', 'Highly Interested', 'MND', 'Ongoing Project',
    'Send Portfolio', 'Callback'
];

const PRIORITIES = ['High', 'Medium', 'Low'];

const getCategoryStyle = (category) => {
    const styles = {
        'Meeting Done': 'bg-green-100 text-green-800 border-green-300',
        'Interested': 'bg-blue-100 text-blue-800 border-blue-300',
        'Call Back': 'bg-orange-100 text-orange-800 border-orange-300',
        'Busy': 'bg-yellow-100 text-yellow-800 border-yellow-300',
        'No Response': 'bg-gray-100 text-gray-700 border-gray-300',
        'Foreign': 'bg-purple-100 text-purple-800 border-purple-300',
        'Future Projection': 'bg-teal-100 text-teal-800 border-teal-300',
        'Needs Review': 'bg-gray-50 text-gray-600 border-gray-200',
        'Not Interested': 'bg-red-100 text-red-800 border-red-300'
    };
    return styles[category] || 'bg-gray-100 text-gray-600';
};

const getPriorityDot = (priority) => {
    const colors = {
        'Highest': 'bg-red-500',
        'High': 'bg-orange-500',
        'Medium': 'bg-yellow-500',
        'Low': 'bg-green-500',
        'Review': 'bg-blue-500',
        'Archive': 'bg-gray-400'
    };
    return colors[priority] || 'bg-gray-400';
};

export default function LeadOverview() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { isAdmin } = useOutletContext();
    
    const [lead, setLead] = useState(null);
    const [loading, setLoading] = useState(true);
    const [teamMembers, setTeamMembers] = useState([]);
    const [showCallLog, setShowCallLog] = useState(false);
    
    // Callback Modal state
    const [callbackModalOpen, setCallbackModalOpen] = useState(false);
    const debounceTimers = useRef({});

    const fetchLead = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/leads/${id}`, { withCredentials: true });
            setLead(res.data);
        } catch (err) {
            console.error('Error fetching lead:', err);
            if (err.response?.status === 404) {
                navigate('/leads');
            }
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        fetchLead();
    }, [fetchLead]);

    useEffect(() => {
        const fetchTeam = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/team`, { withCredentials: true });
                setTeamMembers(res.data);
            } catch (err) {
                console.error('Error fetching team:', err);
            }
        };
        fetchTeam();
    }, []);

    const handleInlineEdit = async (field, value) => {
        if (field === 'category' && value === 'Callback') {
            setCallbackModalOpen(true);
            return;
        }
        try {
            await axios.patch(`${API_URL}/api/leads/${id}`, { [field]: value }, { withCredentials: true });
            setLead(prev => ({ ...prev, [field]: value }));
        } catch (err) {
            console.error('Edit error:', err);
        }
    };

    const handleDebouncedEdit = (field, value) => {
        setLead(prev => ({ ...prev, [field]: value }));
        if (debounceTimers.current[field]) clearTimeout(debounceTimers.current[field]);
        debounceTimers.current[field] = setTimeout(async () => {
            try {
                await axios.patch(`${API_URL}/api/leads/${id}`, { [field]: value }, { withCredentials: true });
            } catch (err) {
                console.error('Debounced edit error:', err);
            }
        }, 800);
    };

    const handleDelete = async () => {
        try {
            await axios.delete(`${API_URL}/api/leads/${id}`, { withCredentials: true });
            navigate('/leads');
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[#E8536A] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Lead not found</p>
            </div>
        );
    }

    const assignedMember = teamMembers.find(m => m.id === lead.assignedTo);
    const lastContactDays = lead.lastContactDate 
        ? Math.floor((Date.now() - new Date(lead.lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;



    return (
        <div className="space-y-6 animate-fade-in" data-testid="lead-overview-page">
            {/* Top Header */}
            <div className="flex items-start justify-between">
                <div>
                    <button 
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-700 mb-2"
                        data-testid="back-btn"
                    >
                        <ArrowLeft size={14} />
                        Back
                    </button>
                    <div className="flex items-center gap-3 flex-wrap">
                        <h1 className="font-heading text-2xl font-semibold text-gray-900">{lead.companyName}</h1>
                        {lead.personName && (
                            <span className="text-sm text-gray-500">{lead.personName}</span>
                        )}
                        {lead.isDuplicate && !lead.duplicateDismissed && (
                            <Badge variant="outline" className="text-amber-700 bg-amber-100 border-amber-300">
                                <AlertTriangle size={12} className="mr-1" />
                                Duplicate
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {lead.category && (
                            <span className={`px-2 py-1 rounded text-[11px] font-medium border ${getCategoryStyle(lead.category)}`}>
                                {lead.category}
                            </span>
                        )}
                        <span className="flex items-center gap-1.5 text-[12px]">
                            <span className={`w-2 h-2 rounded-full ${getPriorityDot(lead.priority)}`} />
                            {lead.priority || 'Low'}
                        </span>
                        {lead.vendorType && (
                            <span className="text-[12px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                {lead.vendorType}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="h-9 text-[12px] text-red-600 border-red-200 hover:bg-red-50 rounded-[8px]"
                                    data-testid="delete-lead-btn"
                                >
                                    <Trash2 size={14} className="mr-1.5" />
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Are you sure you want to delete "{lead.companyName}"? This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                                        Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Contact Details */}
                    <div className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-4">
                        <h2 className="font-heading text-sm font-medium text-gray-900 mb-4">Contact Details</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Company Name</Label>
                                <Input value={lead.companyName || ''} onChange={(e) => handleDebouncedEdit('companyName', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Person Name</Label>
                                <Input value={lead.personName || ''} onChange={(e) => handleDebouncedEdit('personName', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Phone</Label>
                                <Input value={lead.phone || ''} onChange={(e) => handleDebouncedEdit('phone', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                                {lead.phone && <a href={`tel:${lead.phone}`} className="text-[10px] text-[#E8536A] hover:underline flex items-center gap-0.5 mt-0.5"><Phone size={10} /> Call</a>}
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Phone 2</Label>
                                <Input value={lead.phone2 || ''} onChange={(e) => handleDebouncedEdit('phone2', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Email</Label>
                                <Input value={lead.email || ''} onChange={(e) => handleDebouncedEdit('email', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                                {lead.email && <a href={`mailto:${lead.email}`} className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"><Mail size={10} /> Send Email</a>}
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">WhatsApp</Label>
                                <Input value={lead.whatsapp || ''} onChange={(e) => handleDebouncedEdit('whatsapp', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                                {lead.whatsapp && <a href={`https://wa.me/${lead.whatsapp}`} target="_blank" rel="noreferrer" className="text-[10px] text-green-600 hover:underline flex items-center gap-0.5 mt-0.5"><MessageCircle size={10} /> Open WhatsApp</a>}
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Instagram</Label>
                                <Input value={lead.instagram || ''} onChange={(e) => handleDebouncedEdit('instagram', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                                {lead.instagram && <a href={`https://instagram.com/${lead.instagram}`} target="_blank" rel="noreferrer" className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5 mt-0.5"><Instagram size={10} /> @{lead.instagram} <ExternalLink size={8} /></a>}
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Profile URL</Label>
                                <Input value={lead.profileUrl || ''} onChange={(e) => handleDebouncedEdit('profileUrl', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                                {lead.profileUrl && <a href={lead.profileUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 mt-0.5"><Globe size={10} /> Open Link <ExternalLink size={8} /></a>}
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">City</Label>
                                <Input value={lead.city || ''} onChange={(e) => handleDebouncedEdit('city', e.target.value)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                            </div>
                        </div>
                    </div>

                    {/* CRM Details */}
                    <div className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-4">
                        <h2 className="font-heading text-sm font-medium text-gray-900 mb-4">CRM Details</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Type</Label>
                                <Select value={lead.type || 'NA'} onValueChange={(v) => { handleInlineEdit('type', v); if (v === 'No' || v === 'NA') setLead(prev => ({ ...prev, category: null })); }}>
                                    <SelectTrigger className="h-8 text-[12px] rounded-[8px] mt-0.5"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Yes">Yes</SelectItem>
                                        <SelectItem value="No">No</SelectItem>
                                        <SelectItem value="NA">NA</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Category</Label>
                                {lead.type === 'Yes' ? (
                                    <Select value={lead.category || ''} onValueChange={(v) => handleInlineEdit('category', v)}>
                                        <SelectTrigger className="h-8 text-[12px] rounded-[8px] mt-0.5"><SelectValue placeholder="Select..." /></SelectTrigger>
                                        <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                    </Select>
                                ) : (
                                    <div className="h-8 flex items-center text-[12px] text-gray-400 mt-0.5">—</div>
                                )}
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Priority</Label>
                                <Select value={lead.priority || 'Low'} onValueChange={(v) => handleInlineEdit('priority', v)}>
                                    <SelectTrigger className="h-8 text-[12px] rounded-[8px] mt-0.5"><SelectValue /></SelectTrigger>
                                    <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Vendor Type</Label>
                                <Input value={lead.vendorType || ''} onChange={(e) => handleDebouncedEdit('vendorType', e.target.value)} placeholder="e.g. planner, decorator" className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Chatting Via</Label>
                                <Select value={lead.chattingVia || '_none_'} onValueChange={(v) => handleInlineEdit('chattingVia', v === '_none_' ? null : v)}>
                                    <SelectTrigger className="h-8 text-[12px] rounded-[8px] mt-0.5"><SelectValue placeholder="Not Set" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="_none_">Not Set</SelectItem>
                                        {WA_NUMBERS.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Follow-up Date</Label>
                                <Input type="date" value={lead.followUpDate ? lead.followUpDate.split('T')[0] : ''} onChange={(e) => handleInlineEdit('followUpDate', e.target.value || null)} className="h-8 text-[12px] rounded-[8px] mt-0.5" />
                            </div>
                        </div>
                    </div>

                    {/* Meta Info */}
                    <div className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-4">
                        <h2 className="font-heading text-sm font-medium text-gray-900 mb-4">Meta</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Created At</Label>
                                <span className="text-[13px] text-gray-900 block mt-0.5">
                                    {(lead.createdAt || lead.dateAdded) ? new Date(lead.createdAt || lead.dateAdded).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                                </span>
                            </div>
                            <div>
                                <Label className="text-[10px] text-gray-400 uppercase">Last Updated</Label>
                                <span className="text-[13px] text-gray-900 block mt-0.5">
                                    {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    {/* WhatsApp Buttons */}
                    <div className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-4">
                        <h2 className="font-heading text-sm font-medium text-gray-900 mb-3">WhatsApp</h2>
                        <div className="space-y-2">
                            {lead.whatsapp ? (
                                <a
                                    href={`https://wa.me/${lead.whatsapp}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] font-medium text-[13px] transition-colors ${
                                        lead.primaryWhatsapp === 1 
                                            ? 'bg-green-500 text-white hover:bg-green-600' 
                                            : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                                    }`}
                                    data-testid="whatsapp-1-btn"
                                >
                                    <MessageCircle size={16} />
                                    WhatsApp — {lead.whatsapp}
                                </a>
                            ) : (
                                <div className="text-center py-2.5 rounded-[10px] bg-gray-50 text-gray-400 text-[13px]">
                                    No WhatsApp 1
                                </div>
                            )}
                            {lead.whatsapp2 ? (
                                <a
                                    href={`https://wa.me/${lead.whatsapp2}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-[10px] font-medium text-[13px] transition-colors ${
                                        lead.primaryWhatsapp === 2 
                                            ? 'bg-green-500 text-white hover:bg-green-600' 
                                            : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                                    }`}
                                    data-testid="whatsapp-2-btn"
                                >
                                    <MessageCircle size={16} />
                                    WhatsApp — {lead.whatsapp2}
                                </a>
                            ) : (
                                <div className="text-center py-2.5 rounded-[10px] bg-gray-50 text-gray-400 text-[13px]">
                                    No WhatsApp 2
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => handleInlineEdit('primaryWhatsapp', lead.primaryWhatsapp === 1 ? 2 : 1)}
                            className="text-[11px] text-gray-500 hover:text-[#E8536A] mt-2 flex items-center gap-1"
                        >
                            <Edit2 size={10} />
                            Switch primary
                        </button>
                    </div>

                    {/* Call Log */}
                    <div className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-heading text-sm font-medium text-gray-900">Call Log</h2>
                            <Badge variant="secondary" className="text-[10px]">
                                {lead.callCount || 0} Calls
                            </Badge>
                        </div>
                        <Button
                            onClick={() => setShowCallLog(true)}
                            className="w-full bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[10px]"
                            data-testid="open-call-log-btn"
                        >
                            <Phone size={14} className="mr-2" />
                            Log New Response
                        </Button>
                        
                        {/* Recent History */}
                        {lead.responseHistory?.length > 0 && (
                            <div className="mt-4 space-y-2">
                                <p className="text-[10px] text-gray-400 uppercase">Recent Activity</p>
                                {lead.responseHistory.slice(-3).reverse().map((entry, idx) => {
                                    const member = teamMembers.find(m => m.id === entry.teamMember);
                                    return (
                                        <div key={`${entry.timestamp}-${entry.response}-${idx}`} className="text-[11px] border-l-2 border-gray-200 pl-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-700">{entry.response}</span>
                                                {member && (
                                                    <span 
                                                        className="w-2 h-2 rounded-full"
                                                        style={{ backgroundColor: member.color }}
                                                    />
                                                )}
                                            </div>
                                            <p className="text-gray-400">
                                                {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString('en-IN') : ''}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Call Log Panel */}
            {showCallLog && (
                <CallLogPanel
                    lead={lead}
                    onClose={() => setShowCallLog(false)}
                    onUpdate={fetchLead}
                    teamMembers={teamMembers}
                />
            )}
            <CallbackSchedulerModal
                isOpen={callbackModalOpen}
                onClose={() => setCallbackModalOpen(false)}
                lead={lead}
                onScheduled={() => {
                    setLead(prev => ({ ...prev, category: "Callback" }));
                }}
                onSkip={() => {
                    setLead(prev => ({ ...prev, category: "Callback" }));
                }}
            />
        </div>
    );
}

function ChattingViaButton({ lead, onUpdate }) {
    const [open, setOpen] = useState(false);
    const current = WA_NUMBERS.find(n => n.value === lead.chattingVia);

    const handleSelect = async (val) => {
        const newVal = val === lead.chattingVia ? null : val;
        try {
            await axios.put(`${API_URL}/api/leads/${lead.id}/chatting-via`, {
                chattingVia: newVal
            }, { withCredentials: true });
            onUpdate();
        } catch (e) {
            console.error('Failed to update chattingVia');
        }
        setOpen(false);
    };

    return (
        <div>
            <Label className="text-[10px] text-gray-400 uppercase">Chatting Via</Label>
            <div className="relative">
                <button
                    onClick={() => setOpen(!open)}
                    data-testid="chatting-via-btn"
                    className={`flex items-center gap-1.5 mt-0.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all border ${
                        current
                            ? 'bg-green-500 hover:bg-green-600 text-white border-green-600'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-500 border-gray-200'
                    }`}
                >
                    <MessageCircle size={13} />
                    {current ? current.label : 'Not Set'}
                </button>
                {open && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-[10px] shadow-lg z-20 py-1 min-w-[120px]">
                        {WA_NUMBERS.map(n => (
                            <button
                                key={n.value}
                                onClick={() => handleSelect(n.value)}
                                data-testid={`chatting-via-option-${n.value}`}
                                className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 hover:bg-green-50 transition-colors ${
                                    lead.chattingVia === n.value ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-700'
                                }`}
                            >
                                <MessageCircle size={12} className={lead.chattingVia === n.value ? 'text-green-500' : 'text-gray-400'} />
                                {n.label}
                                {lead.chattingVia === n.value && <Check size={12} className="ml-auto text-green-600" />}
                            </button>
                        ))}
                        {lead.chattingVia && (
                            <button
                                onClick={() => handleSelect(lead.chattingVia)}
                                className="w-full text-left px-3 py-1.5 text-[11px] text-red-500 hover:bg-red-50 border-t border-gray-100"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
