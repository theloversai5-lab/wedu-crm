import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Search, Download, Plus, Filter } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import LeadCard from '../components/LeadCard';
import AddLeadModal from '../components/AddLeadModal';

const API_URL = process.env.REACT_APP_API_URL;

const SORT_OPTIONS = [
    { value: 'dateAdded_desc', label: 'Date Added (Newest)' },
    { value: 'dateAdded_asc', label: 'Date Added (Oldest)' },
    { value: 'companyName_asc', label: 'Company A-Z' },
    { value: 'companyName_desc', label: 'Company Z-A' },
    { value: 'city_asc', label: 'By City' },
    { value: 'assignedTo_asc', label: 'By Assigned To' },
    { value: 'priorityRank_asc', label: 'By Priority' },
    { value: 'mostCommonResponseRank_asc', label: 'By Most Common Response' },
    { value: 'followUpDate_asc', label: 'Next Follow-up (Earliest)' },
    { value: 'followUpDate_desc', label: 'Next Follow-up (Latest)' },
    { value: 'lastContactDate_asc', label: 'Last Contact (Oldest)' },
    { value: 'lastContactDate_desc', label: 'Last Contact (Newest)' },
];

const categoryConfig = {
    'Meeting Done': {
        title: 'Meeting Done',
        icon: '📅',
        color: 'bg-green-500',
        defaultSort: 'lastContactDate_desc',
    },
    'Interested': {
        title: 'Interested',
        icon: '✅',
        color: 'bg-blue-500',
        defaultSort: 'followUpDate_asc',
    },
    'Call Back': {
        title: 'Call Back',
        icon: '🔁',
        color: 'bg-orange-500',
        defaultSort: 'followUpDate_asc',
    },
    'Busy': {
        title: 'Busy',
        icon: '⏳',
        color: 'bg-yellow-500',
        defaultSort: 'lastContactDate_desc',
    },
    'No Response': {
        title: 'No Response',
        icon: '📵',
        color: 'bg-gray-500',
        defaultSort: 'lastContactDate_asc',
    },
    'Foreign': {
        title: 'Foreign',
        icon: '🌍',
        color: 'bg-purple-500',
        defaultSort: 'companyName_asc',
    },
    'Future Projection': {
        title: 'Future Projection',
        icon: '🔮',
        color: 'bg-teal-500',
        defaultSort: 'followUpDate_asc',
    },
    'Needs Review': {
        title: 'Needs Review',
        icon: '❓',
        color: 'bg-amber-500',
        defaultSort: 'dateAdded_asc',
    },
    'Not Interested': {
        title: 'Not Interested',
        icon: '❌',
        color: 'bg-red-500',
        defaultSort: 'dateMarkedNotInterested_desc',
    },
};

// Sort function
const sortLeads = (leads, sortKey, teamMembers) => {
    if (!sortKey) return leads;
    const [field, direction] = sortKey.split('_');
    const dir = direction === 'asc' ? 1 : -1;
    
    return [...leads].sort((a, b) => {
        let valA, valB;
        
        switch (field) {
            case 'companyName':
                valA = (a.companyName || '').toLowerCase();
                valB = (b.companyName || '').toLowerCase();
                break;
            case 'city':
                valA = (a.city || 'zzz').toLowerCase();
                valB = (b.city || 'zzz').toLowerCase();
                break;
            case 'assignedTo':
                const memberA = teamMembers.find(m => m.id === a.assignedTo);
                const memberB = teamMembers.find(m => m.id === b.assignedTo);
                valA = memberA?.name?.toLowerCase() || 'zzz';
                valB = memberB?.name?.toLowerCase() || 'zzz';
                break;
            case 'priorityRank':
                valA = a.priorityRank || 99;
                valB = b.priorityRank || 99;
                break;
            case 'mostCommonResponseRank':
                valA = a.mostCommonResponseRank || 99;
                valB = b.mostCommonResponseRank || 99;
                // Within same rank, sort by most recent response date
                if (valA === valB) {
                    const lastA = a.responseHistory?.length > 0 
                        ? new Date(a.responseHistory[a.responseHistory.length - 1].timestamp).getTime() 
                        : 0;
                    const lastB = b.responseHistory?.length > 0 
                        ? new Date(b.responseHistory[b.responseHistory.length - 1].timestamp).getTime() 
                        : 0;
                    return lastB - lastA; // Most recent first within group
                }
                break;
            case 'followUpDate':
                valA = a.followUpDate ? new Date(a.followUpDate).getTime() : Infinity;
                valB = b.followUpDate ? new Date(b.followUpDate).getTime() : Infinity;
                break;
            case 'lastContactDate':
                valA = a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0;
                valB = b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0;
                break;
            case 'dateAdded':
                valA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
                valB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
                break;
            case 'dateMarkedNotInterested':
                valA = a.dateMarkedNotInterested ? new Date(a.dateMarkedNotInterested).getTime() : 0;
                valB = b.dateMarkedNotInterested ? new Date(b.dateMarkedNotInterested).getTime() : 0;
                break;
            default:
                valA = a[field] || '';
                valB = b[field] || '';
        }
        
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
};

export default function CategoryPage({ category }) {
    const { isAdmin } = useOutletContext();
    const config = categoryConfig[category] || { title: category, icon: '📋', color: 'bg-gray-500', defaultSort: 'dateAdded_desc' };
    
    const [leads, setLeads] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filters
    const [search, setSearch] = useState('');
    const [assignedToFilter, setAssignedToFilter] = useState('');
    const [sortKey, setSortKey] = useState(config.defaultSort);
    
    // Modal
    const [addLeadModalOpen, setAddLeadModalOpen] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            params.append('category', category);
            params.append('limit', '500');
            if (assignedToFilter) params.append('assignedTo', assignedToFilter);
            if (search) params.append('search', search);

            const [leadsRes, teamRes] = await Promise.all([
                axios.get(`${API_URL}/api/leads?${params.toString()}`, { withCredentials: true }),
                axios.get(`${API_URL}/api/team`, { withCredentials: true })
            ]);

            setLeads(leadsRes.data.leads || []);
            setTeamMembers(teamRes.data);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    }, [category, assignedToFilter, search]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Export CSV
    const handleExport = () => {
        const params = new URLSearchParams();
        params.append('category', category);
        if (assignedToFilter) params.append('assignedTo', assignedToFilter);
        if (search) params.append('search', search);
        window.open(`${API_URL}/api/leads/export?${params.toString()}`, '_blank');
    };

    const sortedLeads = sortLeads(leads, sortKey, teamMembers);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[#E8536A] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-in" data-testid={`category-page-${category.toLowerCase().replace(/\s+/g, '-')}`}>
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full ${config.color} flex items-center justify-center text-2xl`}>
                        {config.icon}
                    </div>
                    <div>
                        <h1 className="font-heading text-xl font-semibold text-gray-900">{config.title}</h1>
                        <p className="text-[13px] text-gray-500">{sortedLeads.length} leads</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleExport}
                        variant="outline"
                        className="h-8 text-[11px] rounded-[8px]"
                    >
                        <Download size={12} className="mr-1.5" />
                        Export
                    </Button>
                    <Button
                        onClick={() => setAddLeadModalOpen(true)}
                        className="h-8 text-[11px] rounded-[8px] bg-[#E8536A] hover:bg-[#D43D54] text-white"
                        data-testid="add-lead-btn"
                    >
                        <Plus size={12} className="mr-1.5" />
                        Add Lead
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white rounded-[12px] shadow-sm border border-gray-100 p-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[180px] max-w-[280px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search company, phone, city..."
                            className="pl-9 h-8 text-[12px] rounded-[8px]"
                            data-testid="search-input"
                        />
                    </div>

                    <Select value={assignedToFilter || undefined} onValueChange={(v) => setAssignedToFilter(v === '_all_' ? '' : v)}>
                        <SelectTrigger className="w-[140px] h-8 text-[11px] rounded-[8px]">
                            <Filter size={12} className="mr-1.5" />
                            <SelectValue placeholder="Assigned To" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="_all_">All Members</SelectItem>
                            {teamMembers.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={sortKey} onValueChange={setSortKey}>
                        <SelectTrigger className="w-[180px] h-8 text-[11px] rounded-[8px]" data-testid="sort-select">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            {SORT_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Leads Grid */}
            {sortedLeads.length === 0 ? (
                <div className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-8 text-center">
                    <div className={`w-16 h-16 rounded-full ${config.color} flex items-center justify-center text-3xl mx-auto mb-4 opacity-50`}>
                        {config.icon}
                    </div>
                    <p className="text-gray-500 text-[14px]">No leads in {config.title}</p>
                    <p className="text-gray-400 text-[12px] mt-1">Add leads or import from CSV to see them here</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedLeads.map(lead => (
                        <LeadCard
                            key={lead.id}
                            lead={lead}
                            teamMembers={teamMembers}
                            onUpdate={fetchData}
                            showRevive={category === 'Not Interested'}
                        />
                    ))}
                </div>
            )}

            {/* Add Lead Modal */}
            <AddLeadModal
                open={addLeadModalOpen}
                onClose={() => setAddLeadModalOpen(false)}
                onSuccess={() => { setAddLeadModalOpen(false); fetchData(); }}
                teamMembers={teamMembers}
                defaultCategory={category}
            />
        </div>
    );
}
