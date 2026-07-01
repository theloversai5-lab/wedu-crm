import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';

const API_URL = process.env.REACT_APP_API_URL;

const CATEGORIES = [
    'Meeting Done', 'Interested', 'Call Back', 'Busy', 'No Response',
    'Foreign', 'Future Projection', 'Needs Review', 'Not Interested'
];

const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Review', 'Archive'];

const PIPELINE_STAGES = [
    "New Contact", "Interested", "Send Portfolio", "Time Given",
    "Meeting Scheduled", "Meeting Done", "Project Follow-up", "Onboarded",
    "Unknown", "Call Again 1", "Call Again 2", "Call Again 3",
    "Not Answering", "Not Interested"
];

export default function AddLeadModal({ open, onClose, onSuccess, teamMembers, defaultCategory = 'Needs Review' }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    const [formData, setFormData] = useState({
        companyName: '',
        personName: '',
        phone: '',
        phone2: '',
        companyName: '',
        personName: '',
        phone: '',
        phone2: '',
        whatsapp: '',
        instagram: '',
        profileUrl: '',
        email: '',
        city: '',
        type: 'NA',
        category: defaultCategory,
        priority: 'Medium',
        vendorType: '',
        chattingVia: '',
        followUpDate: ''
    });

    // Update category when defaultCategory changes
    useEffect(() => {
        setFormData(prev => ({ ...prev, category: defaultCategory }));
    }, [defaultCategory]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.companyName.trim()) {
            setError('Company name is required');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const payload = { ...formData };
            if (!payload.followUpDate) {
                delete payload.followUpDate; // prevent validation error for empty datetime string
            }
            
            await axios.post(`${API_URL}/api/leads`, payload, { withCredentials: true });
            onSuccess();
            // Reset form
            setFormData({
                companyName: '',
                personName: '',
                phone: '',
                phone2: '',
                whatsapp: '',
                instagram: '',
                profileUrl: '',
                email: '',
                city: '',
                type: 'NA',
                category: defaultCategory,
                priority: 'Medium',
                vendorType: '',
                chattingVia: '',
                followUpDate: ''
            });
        } catch (err) {
            const detail = err.response?.data?.detail;
            if (Array.isArray(detail)) {
                setError(detail.map(d => `${d.loc?.join('.')} - ${d.msg}`).join(', '));
            } else if (typeof detail === 'string') {
                setError(detail);
            } else {
                setError('Failed to create lead');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh]">
                <DialogHeader>
                    <DialogTitle className="font-heading flex items-center gap-2">
                        <Plus size={20} className="text-[#E8536A]" />
                        Add New Lead
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="max-h-[calc(90vh-120px)]">
                    <form onSubmit={handleSubmit} className="space-y-4 p-1">
                        {/* Company Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px]">Company Name *</Label>
                                <Input
                                    value={formData.companyName}
                                    onChange={(e) => handleChange('companyName', e.target.value)}
                                    placeholder="Enter company name"
                                    className="h-9 text-[12px] rounded-[8px]"
                                    required
                                    data-testid="add-lead-company"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px]">Person Name</Label>
                                <Input
                                    value={formData.personName}
                                    onChange={(e) => handleChange('personName', e.target.value)}
                                    placeholder="Contact person"
                                    className="h-9 text-[12px] rounded-[8px]"
                                    data-testid="add-lead-person"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px]">Email</Label>
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => handleChange('email', e.target.value)}
                                    placeholder="email@example.com"
                                    className="h-9 text-[12px] rounded-[8px]"
                                />
                            </div>
                        </div>

                        {/* Phone Numbers */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px]">Phone</Label>
                                <Input
                                    value={formData.phone}
                                    onChange={(e) => handleChange('phone', e.target.value)}
                                    placeholder="9876543210"
                                    className="h-9 text-[12px] rounded-[8px]"
                                    data-testid="add-lead-phone"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px]">Phone 2</Label>
                                <Input
                                    value={formData.phone2}
                                    onChange={(e) => handleChange('phone2', e.target.value)}
                                    placeholder="Secondary phone"
                                    className="h-9 text-[12px] rounded-[8px]"
                                />
                            </div>
                        </div>

                        {/* WhatsApp, Instagram & Profile URL */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px]">WhatsApp</Label>
                                <Input
                                    value={formData.whatsapp}
                                    onChange={(e) => handleChange('whatsapp', e.target.value)}
                                    placeholder="WhatsApp number"
                                    className="h-9 text-[12px] rounded-[8px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px]">Instagram</Label>
                                <Input
                                    value={formData.instagram}
                                    onChange={(e) => handleChange('instagram', e.target.value)}
                                    placeholder="@handle"
                                    className="h-9 text-[12px] rounded-[8px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px]">Profile URL</Label>
                                <Input
                                    value={formData.profileUrl}
                                    onChange={(e) => handleChange('profileUrl', e.target.value)}
                                    placeholder="https://"
                                    className="h-9 text-[12px] rounded-[8px]"
                                />
                            </div>
                        </div>

                        {/* Location */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px]">City</Label>
                                <Input
                                    value={formData.city}
                                    onChange={(e) => handleChange('city', e.target.value)}
                                    placeholder="City"
                                    className="h-9 text-[12px] rounded-[8px]"
                                    data-testid="add-lead-city"
                                />
                            </div>
                        </div>

                        {/* Status Fields */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px]">Type</Label>
                                <Select value={formData.type} onValueChange={(v) => handleChange('type', v)}>
                                    <SelectTrigger className="h-9 text-[12px] rounded-[8px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {['Yes', 'No', 'NA'].map(t => (
                                            <SelectItem key={t} value={t}>{t}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px]">Category</Label>
                                <Select value={formData.category} onValueChange={(v) => handleChange('category', v)} disabled={formData.type !== 'Yes'}>
                                    <SelectTrigger className="h-9 text-[12px] rounded-[8px]" data-testid="add-lead-category">
                                        <SelectValue placeholder={formData.type === 'Yes' ? "Select Category" : "—"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORIES.map(c => (
                                            <SelectItem key={c} value={c}>{c}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px]">Priority</Label>
                                <Select value={formData.priority} onValueChange={(v) => handleChange('priority', v)}>
                                    <SelectTrigger className="h-9 text-[12px] rounded-[8px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PRIORITIES.map(p => (
                                            <SelectItem key={p} value={p}>{p}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Extra Properties */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-[11px]">Vendor Type</Label>
                                <Input
                                    value={formData.vendorType}
                                    onChange={(e) => handleChange('vendorType', e.target.value)}
                                    placeholder="Venue, Photographer..."
                                    className="h-9 text-[12px] rounded-[8px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px]">Chatting Via</Label>
                                <Input
                                    value={formData.chattingVia}
                                    onChange={(e) => handleChange('chattingVia', e.target.value)}
                                    placeholder="WhatsApp, IG..."
                                    className="h-9 text-[12px] rounded-[8px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px]">Follow-up Date</Label>
                                <Input
                                    type="date"
                                    value={formData.followUpDate}
                                    onChange={(e) => handleChange('followUpDate', e.target.value)}
                                    className="h-9 text-[12px] rounded-[8px]"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                {error}
                            </div>
                        )}

                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                className="rounded-[8px]"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading}
                                className="bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[8px]"
                                data-testid="submit-add-lead"
                            >
                                {loading ? 'Creating...' : 'Add Lead'}
                            </Button>
                        </div>
                    </form>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
