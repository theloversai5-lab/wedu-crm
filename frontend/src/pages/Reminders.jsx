import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Bell, AlertTriangle, Clock, Calendar, ChevronRight, Phone, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL;

const SECTIONS = [
    { key: 'overdue', label: 'Overdue', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', badge: 'bg-red-500' },
    { key: 'today', label: 'Today', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', badge: 'bg-amber-500' },
    { key: 'tomorrow', label: 'Tomorrow', icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', badge: 'bg-blue-500' },
    { key: 'thisWeek', label: 'This Week', icon: ChevronRight, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100', badge: 'bg-green-500' },
];

export default function Reminders() {
    const navigate = useNavigate();
    const [data, setData] = useState({ overdue: [], today: [], tomorrow: [], thisWeek: [], counts: {} });
    const [loading, setLoading] = useState(true);

    const fetchReminders = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/reminders`, { withCredentials: true });
            setData(res.data);
        } catch (e) {
            console.error('Failed to load reminders');
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchReminders(); }, [fetchReminders]);

    const totalCount = Object.values(data.counts).reduce((sum, v) => sum + (v || 0), 0);

    return (
        <div className="max-w-3xl mx-auto py-6 px-4" data-testid="reminders-page">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <Bell size={22} className="text-[#E8536A]" />
                    <h1 className="text-xl font-heading font-semibold text-gray-900">Reminders</h1>
                    {totalCount > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8536A] text-white">{totalCount}</span>
                    )}
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3 mb-5">
                {SECTIONS.map(s => (
                    <div key={s.key} className={`rounded-[10px] p-3 text-center ${s.bg} ${s.border} border`} data-testid={`reminder-count-${s.key}`}>
                        <p className={`text-2xl font-bold ${s.color}`}>{data.counts[s.key] || 0}</p>
                        <p className={`text-[10px] font-medium ${s.color}`}>{s.label}</p>
                    </div>
                ))}
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-400 text-[13px]">Loading reminders...</div>
            ) : totalCount === 0 ? (
                <div className="text-center py-12">
                    <Bell size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-[13px] text-gray-500">No upcoming follow-ups</p>
                    <p className="text-[11px] text-gray-400 mt-1">Leads with follow-up dates will appear here</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {SECTIONS.map(section => {
                        const leads = data[section.key];
                        if (!leads || leads.length === 0) return null;
                        return (
                            <div key={section.key}>
                                <div className="flex items-center gap-2 mb-2">
                                    <section.icon size={14} className={section.color} />
                                    <h2 className={`text-[12px] font-bold uppercase tracking-wide ${section.color}`}>
                                        {section.label} ({leads.length})
                                    </h2>
                                </div>
                                <div className="space-y-1.5">
                                    {leads.map(lead => (
                                        <ReminderRow key={lead.id} lead={lead} section={section} navigate={navigate} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function ReminderRow({ lead, section, navigate }) {
    const followupDate = lead.followUpDate ? new Date(lead.followUpDate) : null;
    const dateStr = followupDate
        ? followupDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        : '-';

    return (
        <button
            onClick={() => navigate(`/leads/${lead.id}`)}
            className={`w-full text-left flex items-center gap-3 p-2.5 rounded-[10px] border transition-colors hover:ring-1 hover:ring-[#E8536A]/20 ${section.bg} ${section.border}`}
            data-testid={`reminder-lead-${lead.id}`}
        >
            <div className={`w-2 h-2 rounded-full ${section.badge} shrink-0`} />
            <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-gray-800 truncate">{lead.companyName || 'Unnamed'}</p>
                <div className="flex items-center gap-3 mt-0.5">
                    {lead.phone && (
                        <span className="text-[10px] text-gray-500 flex items-center gap-0.5"><Phone size={9} /> {lead.phone}</span>
                    )}
                    {lead.city && (
                        <span className="text-[10px] text-gray-500 flex items-center gap-0.5"><MapPin size={9} /> {lead.city}</span>
                    )}
                    <span className="text-[10px] text-gray-400">{lead.category}</span>
                </div>
            </div>
            <div className="text-right shrink-0">
                <p className={`text-[11px] font-medium ${section.key === 'overdue' ? 'text-red-600' : 'text-gray-600'}`}>
                    {dateStr}
                </p>
                {lead.assignedTo && (
                    <p className="text-[9px] text-gray-400 mt-0.5">Assigned</p>
                )}
            </div>
        </button>
    );
}
