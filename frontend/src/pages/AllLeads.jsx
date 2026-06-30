import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { 
    ChevronDown, ChevronUp, Phone,
    Download, Upload, Plus, Trash2, Users, Check, Edit2,
    ArrowUpDown, PhoneCall, ExternalLink
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import { ScrollArea } from '../components/ui/scroll-area';
import { Badge } from '../components/ui/badge';
import CallLogPanel from '../components/CallLogPanel';
import ImportModal from '../components/ImportModal';
import AddLeadModal from '../components/AddLeadModal';
import CallbackSchedulerModal from '../components/CallbackSchedulerModal';

import { LeadFilterBar } from '../components/LeadFilterBar';

const API_URL = process.env.REACT_APP_API_URL;

const CATEGORIES = [
    'Meeting Done', 'Highly Interested', 'MND', 'Ongoing Project',
    'Send Portfolio', 'Callback'
];

const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Review', 'Archive'];

const getCategoryStyle = (category) => {
    const styles = {
        'Meeting Done': 'bg-green-100 text-green-800 border-green-200',
        'Highly Interested': 'bg-blue-100 text-blue-800 border-blue-200',
        'MND': 'bg-purple-100 text-purple-800 border-purple-200',
        'Ongoing Project': 'bg-teal-100 text-teal-800 border-teal-200',
        'Send Portfolio': 'bg-orange-100 text-orange-800 border-orange-200',
        'Callback': 'bg-yellow-100 text-yellow-800 border-yellow-200'
    };
    return styles[category] || 'bg-gray-100 text-gray-600';
};

const getRowBgColor = (category) => {
    const colors = {
        'Meeting Done': 'bg-green-50/50',
        'Highly Interested': 'bg-blue-50/50',
        'MND': 'bg-purple-50/50',
        'Ongoing Project': 'bg-teal-50/50',
        'Send Portfolio': 'bg-orange-50/50',
        'Callback': 'bg-yellow-50/50'
    };
    return colors[category] || '';
};

const getPriorityColor = (priority) => {
    const colors = {
        'Highest': 'text-red-600',
        'High': 'text-orange-600',
        'Medium': 'text-yellow-600',
        'Low': 'text-green-600',
        'Review': 'text-blue-600',
        'Archive': 'text-gray-400'
    };
    return colors[priority] || 'text-gray-600';
};

export default function AllLeads() {
    const { counts, isAdmin } = useOutletContext();
    const navigate = useNavigate();
    
    // Data states
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [teamMembers, setTeamMembers] = useState([]);
    const [cities, setCities] = useState([]);
    const [sources, setSources] = useState([]);
    
    // Filter states
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [vendorTypeFilter, setVendorTypeFilter] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [cityFilter, setCityFilter] = useState('');
    const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
    const [chattingViaFilter, setChattingViaFilter] = useState('');
    
    // Sort states
    const [sortField, setSortField] = useState('categoryRank');
    const [sortDirection, setSortDirection] = useState(1);
    const [sortField2, setSortField2] = useState('');
    const [sortDirection2, setSortDirection2] = useState(1);
    
    // Pagination
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    
    // Selection
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [selectAll, setSelectAll] = useState(false);
    
    // Modals
    const [callLogLead, setCallLogLead] = useState(null);
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [addLeadModalOpen, setAddLeadModalOpen] = useState(false);
    const [callbackModalLead, setCallbackModalLead] = useState(null);
    
    // Inline editing
    const [editingCell, setEditingCell] = useState(null);
    const [editValue, setEditValue] = useState('');
    
    const searchTimeout = useRef(null);

    // Fetch team members, cities, sources
    useEffect(() => {
        const fetchFilters = async () => {
            try {
                const [teamRes, citiesRes, sourcesRes] = await Promise.all([
                    axios.get(`${API_URL}/api/team`, { withCredentials: true }),
                    axios.get(`${API_URL}/api/leads/cities`, { withCredentials: true }),
                    axios.get(`${API_URL}/api/leads/sources`, { withCredentials: true })
                ]);
                setTeamMembers(teamRes.data);
                setCities(citiesRes.data);
                setSources(sourcesRes.data);
            } catch (err) {
                console.error('Error fetching filters:', err);
            }
        };
        fetchFilters();
    }, []);

    // Fetch leads
    const fetchLeads = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (categoryFilter) params.append('category', categoryFilter);
            if (typeFilter) params.append('type', typeFilter);
            if (vendorTypeFilter) params.append('vendorType', vendorTypeFilter);
            if (priorityFilter) params.append('priority', priorityFilter);
            if (cityFilter) params.append('city', cityFilter);
            if (showDuplicatesOnly) params.append('showDuplicatesOnly', 'true');
            if (chattingViaFilter) params.append('chattingVia', chattingViaFilter);
            if (search) params.append('search', search);
            params.append('sortField', sortField);
            params.append('sortDirection', sortDirection);
            if (sortField2) {
                params.append('sortField2', sortField2);
                params.append('sortDirection2', sortDirection2);
            }
            params.append('limit', pageSize);
            params.append('skip', page * pageSize);

            const response = await axios.get(`${API_URL}/api/leads?${params.toString()}`, {
                withCredentials: true
            });
            setLeads(response.data.leads);
            setTotal(response.data.total);
        } catch (err) {
            console.error('Error fetching leads:', err);
        } finally {
            setLoading(false);
        }
    }, [categoryFilter, typeFilter, vendorTypeFilter, priorityFilter, cityFilter, showDuplicatesOnly, chattingViaFilter, search, sortField, sortDirection, sortField2, sortDirection2, page, pageSize]);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    // Debounced search
    const handleSearchChange = (value) => {
        setSearch(value);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            setPage(0);
        }, 300);
    };

    // Sort handler
    const handleSort = (field, e) => {
        if (e?.shiftKey && sortField) {
            // Multi-column sort
            if (sortField2 === field) {
                setSortDirection2(sortDirection2 === 1 ? -1 : 1);
            } else {
                setSortField2(field);
                setSortDirection2(1);
            }
        } else {
            if (sortField === field) {
                setSortDirection(sortDirection === 1 ? -1 : 1);
            } else {
                setSortField(field);
                setSortDirection(1);
            }
            setSortField2('');
        }
        setPage(0);
    };

    // Selection handlers
    const handleSelectAll = (checked) => {
        setSelectAll(checked);
        if (checked) {
            setSelectedIds(new Set(leads.map(l => l.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (id, checked) => {
        const newSelected = new Set(selectedIds);
        if (checked) {
            newSelected.add(id);
        } else {
            newSelected.delete(id);
        }
        setSelectedIds(newSelected);
        setSelectAll(newSelected.size === leads.length);
    };

    // Bulk actions
    const handleBulkDelete = async () => {
        if (!window.confirm(`Delete ${selectedIds.size} leads?`)) return;
        try {
            await axios.post(`${API_URL}/api/leads/bulk`, {
                leadIds: Array.from(selectedIds),
                action: 'delete'
            }, { withCredentials: true });
            setSelectedIds(new Set());
            fetchLeads();
        } catch (err) {
            console.error('Bulk delete error:', err);
        }
    };

    const handleBulkReassign = async (userId) => {
        try {
            await axios.post(`${API_URL}/api/leads/bulk`, {
                leadIds: Array.from(selectedIds),
                action: 'reassign',
                value: userId
            }, { withCredentials: true });
            setSelectedIds(new Set());
            fetchLeads();
        } catch (err) {
            console.error('Bulk reassign error:', err);
        }
    };

    // Inline edit
    const startEdit = (leadId, field, currentValue) => {
        setEditingCell({ leadId, field });
        setEditValue(currentValue || '');
    };

    const saveEdit = async () => {
        if (!editingCell) return;
        try {
            await axios.patch(`${API_URL}/api/leads/${editingCell.leadId}`, {
                [editingCell.field]: editValue
            }, { withCredentials: true });
            fetchLeads();
        } catch (err) {
            console.error('Edit error:', err);
        }
        setEditingCell(null);
    };

    const cancelEdit = () => {
        setEditingCell(null);
        setEditValue('');
    };

    // Export
    const handleExport = async () => {
        try {
            const params = new URLSearchParams();
            if (categoryFilter) params.append('category', categoryFilter);
            if (priorityFilter) params.append('priority', priorityFilter);
            if (assignedToFilter) params.append('assignedTo', assignedToFilter);
            if (cityFilter) params.append('city', cityFilter);
            if (search) params.append('search', search);
            
            const res = await axios.get(`${API_URL}/api/leads/export?${params.toString()}`, {
                withCredentials: true,
                responseType: 'blob'
            });
            
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `leads_export_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export failed:', err);
        }
    };

    // Clear filters
    const clearFilters = () => {
        setCategoryFilter('');
        setTypeFilter('');
        setVendorTypeFilter('');
        setPriorityFilter('');
        setCityFilter('');
        setShowDuplicatesOnly(false);
        setChattingViaFilter('');
        setSearch('');
        setPage(0);
    };

    const hasFilters = categoryFilter || typeFilter || vendorTypeFilter || priorityFilter || cityFilter || showDuplicatesOnly || chattingViaFilter || search;

    const SortIcon = ({ field }) => {
        const isActive = sortField === field;
        const isSecondary = sortField2 === field;
        const dir = isActive ? sortDirection : (isSecondary ? sortDirection2 : 0);
        
        if (!isActive && !isSecondary) {
            return <ArrowUpDown size={12} className="text-gray-300 ml-1" />;
        }
        return dir === 1 
            ? <ChevronUp size={12} className={`ml-1 ${isSecondary ? 'text-blue-400' : 'text-[#E8536A]'}`} />
            : <ChevronDown size={12} className={`ml-1 ${isSecondary ? 'text-blue-400' : 'text-[#E8536A]'}`} />;
    };

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="space-y-3 animate-fade-in" data-testid="all-leads-page">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="font-heading text-xl font-semibold text-gray-900">All Leads</h1>
                    <p className="text-[11px] text-gray-500">
                        Showing {leads.length} of {total} leads
                        {hasFilters && <span className="text-[#E8536A]"> (filtered)</span>}
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Button
                        onClick={() => setImportModalOpen(true)}
                        variant="outline"
                        className="h-8 text-[11px] rounded-[8px]"
                        data-testid="import-btn"
                    >
                        <Upload size={12} className="mr-1.5" />
                        Import
                    </Button>
                    <Button
                        onClick={handleExport}
                        variant="outline"
                        className="h-8 text-[11px] rounded-[8px]"
                        data-testid="export-btn"
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
                <LeadFilterBar
                    search={search}
                    onSearchChange={handleSearchChange}
                    typeFilter={typeFilter}
                    onTypeChange={(v) => { setTypeFilter(v); setPage(0); }}
                    vendorTypeFilter={vendorTypeFilter}
                    onVendorTypeChange={(v) => { setVendorTypeFilter(v); setPage(0); }}
                    categoryFilter={categoryFilter}
                    onCategoryChange={(v) => { setCategoryFilter(v); setPage(0); }}
                    priorityFilter={priorityFilter}
                    onPriorityChange={(v) => { setPriorityFilter(v); setPage(0); }}
                    cityFilter={cityFilter}
                    onCityChange={(v) => { setCityFilter(v); setPage(0); }}
                    showDuplicatesOnly={showDuplicatesOnly}
                    onDuplicatesChange={(v) => { setShowDuplicatesOnly(v); setPage(0); }}
                    chattingViaFilter={chattingViaFilter}
                    onChattingViaChange={(v) => { setChattingViaFilter(v); setPage(0); }}
                    hasFilters={hasFilters}
                    onClearFilters={clearFilters}
                    teamMembers={teamMembers}
                    cities={cities}
                />

                {/* Bulk Actions */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                        <span className="text-[11px] text-gray-500">{selectedIds.size} selected</span>
                        {isAdmin && (
                            <>
                                <Button
                                    onClick={handleBulkDelete}
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    <Trash2 size={10} className="mr-1" />
                                    Delete
                                </Button>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-7 text-[10px]">
                                            <Users size={10} className="mr-1" />
                                            Reassign
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        {teamMembers.map(m => (
                                            <DropdownMenuItem key={m.id} onClick={() => handleBulkReassign(m.id)}>
                                                {m.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-[12px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-[11px]" data-testid="leads-table">
                        <thead className="bg-gray-50/80 sticky top-0 z-10">
                            <tr className="border-b border-gray-100">
                                <th className="w-8 px-2 py-2">
                                    <Checkbox
                                        checked={selectAll}
                                        onCheckedChange={handleSelectAll}
                                        className="h-3.5 w-3.5"
                                    />
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-8">#</th>
                                <th 
                                    className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 min-w-[140px]"
                                    onClick={(e) => handleSort('companyName', e)}
                                >
                                    <span className="flex items-center">Company <SortIcon field="companyName" /></span>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider min-w-[90px]">Vendor Type</th>
                                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider min-w-[60px]">Profile</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider min-w-[90px]">Phone</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider min-w-[90px]">Phone 2</th>
                                <th 
                                    className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 min-w-[70px]"
                                    onClick={(e) => handleSort('city', e)}
                                >
                                    <span className="flex items-center">City <SortIcon field="city" /></span>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider min-w-[150px]">Last Update</th>
                                <th 
                                    className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 min-w-[70px]"
                                    onClick={(e) => handleSort('type', e)}
                                >
                                    <span className="flex items-center">Type <SortIcon field="type" /></span>
                                </th>
                                <th 
                                    className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 min-w-[90px]"
                                    onClick={(e) => handleSort('categoryRank', e)}
                                >
                                    <span className="flex items-center">Category <SortIcon field="categoryRank" /></span>
                                </th>
                                <th 
                                    className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 min-w-[80px]"
                                    onClick={(e) => handleSort('followUpDate', e)}
                                >
                                    <span className="flex items-center">Follow-up <SortIcon field="followUpDate" /></span>
                                </th>
                                <th 
                                    className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 min-w-[60px]"
                                    onClick={(e) => handleSort('priorityRank', e)}
                                >
                                    <span className="flex items-center">Priority <SortIcon field="priorityRank" /></span>
                                </th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider min-w-[100px]">Business No.</th>
                                <th className="px-2 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wider w-20">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={19} className="text-center py-8">
                                        <div className="w-6 h-6 border-2 border-[#E8536A] border-t-transparent rounded-full animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : leads.length === 0 ? (
                                <tr>
                                    <td colSpan={19} className="text-center py-8 text-gray-500">
                                        No leads found. Import or add leads to get started.
                                    </td>
                                </tr>
                            ) : (
                                leads.map((lead, idx) => {
                                    const assignedMember = teamMembers.find(m => m.id === lead.assignedTo);
                                    const isDuplicate = lead.isDuplicate && !lead.duplicateDismissed;
                                    
                                    return (
                                        <tr 
                                            key={lead.id}
                                            className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${getRowBgColor(lead.category)} ${isDuplicate ? 'border-l-4 border-l-amber-400' : ''}`}
                                            data-testid={`lead-row-${lead.id}`}
                                        >
                                            <td className="px-2 py-1">
                                                <Checkbox
                                                    checked={selectedIds.has(lead.id)}
                                                    onCheckedChange={(checked) => handleSelectRow(lead.id, checked)}
                                                    className="h-3.5 w-3.5"
                                                />
                                            </td>
                                            <td className="px-2 py-1 text-gray-400">{page * pageSize + idx + 1}</td>
                                            <td className="px-2 py-1">
                                                <div className="flex items-center gap-1">
                                                    {isDuplicate && (
                                                        <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700 border-amber-300">
                                                            DUP
                                                        </Badge>
                                                    )}
                                                    <Link 
                                                        to={`/leads/${lead.id}`}
                                                        className="font-medium text-gray-900 hover:text-[#E8536A] hover:underline truncate max-w-[120px]"
                                                    >
                                                        {lead.companyName}
                                                    </Link>
                                                    {lead.personName && (
                                                        <span className="block text-[10px] text-gray-400 truncate max-w-[120px]">{lead.personName}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-2 py-1 text-gray-600 truncate max-w-[100px]">{lead.vendorType || '-'}</td>
                                            <td className="px-2 py-1 text-center">
                                                {lead.profileUrl ? (
                                                    <a href={lead.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center text-blue-500 hover:text-blue-700">
                                                        <ExternalLink size={14} />
                                                    </a>
                                                ) : <span className="text-gray-300">-</span>}
                                            </td>
                                            <td className="px-2 py-1">
                                                {lead.phone && (
                                                    <a href={`tel:${lead.phone}`} className="text-gray-600 hover:text-[#E8536A]">
                                                        {lead.phone}
                                                    </a>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 text-gray-600">{lead.phone2 || '-'}</td>
                                            <td className="px-2 py-1 text-gray-600">{lead.city || '-'}</td>
                                            <td className="px-2 py-1">
                                                {editingCell?.leadId === (lead.id || lead._id) && editingCell?.field === 'lastUpdate' ? (
                                                    <div className="flex flex-col gap-1">
                                                        <input 
                                                            type="text"
                                                            className="w-full text-[10px] border border-gray-300 rounded px-1 py-0.5 outline-none focus:border-[#E8536A] focus:ring-1 focus:ring-[#E8536A]"
                                                            autoFocus
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onBlur={async () => {
                                                                const prevLeads = [...leads];
                                                                const leadId = lead.id || lead._id;
                                                                console.log("Saving lastUpdate:", editValue, "for lead:", leadId);
                                                                try {
                                                                    setLeads(prev => prev.map(l => (l.id || l._id) === leadId ? { ...l, lastUpdate: editValue, lastUpdateDate: new Date().toISOString() } : l));
                                                                    await axios.patch(`${API_URL}/api/leads/${leadId}`, { lastUpdate: editValue }, { withCredentials: true });
                                                                } catch(e) {
                                                                    console.error(e);
                                                                    setLeads(prevLeads);
                                                                }
                                                                setEditingCell(null);
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.target.blur();
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div 
                                                        className="cursor-pointer hover:bg-gray-50 min-h-[24px] p-1 rounded group flex flex-col"
                                                        onClick={() => startEdit(lead.id || lead._id, 'lastUpdate', lead.lastUpdate || '')}
                                                    >
                                                        {lead.lastUpdate ? (
                                                            <>
                                                                <span className="text-[11px] text-gray-700 leading-tight truncate max-w-[150px]">{lead.lastUpdate}</span>
                                                                <span className="text-[9px] text-gray-400 mt-0.5">
                                                                    {lead.lastUpdateDate ? new Date(lead.lastUpdateDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-400 italic">Add note...</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1">
                                                {editingCell?.leadId === lead.id && editingCell?.field === 'type' ? (
                                                    <Select
                                                        value={editValue}
                                                        onValueChange={async (val) => {
                                                            setEditValue(val);
                                                            const prevLeads = [...leads];
                                                            try {
                                                                setLeads(prev => prev.map(l => {
                                                                    if (l.id === lead.id) {
                                                                        const updatedLead = { ...l, type: val };
                                                                        if (val === 'No' || val === 'NA') {
                                                                            updatedLead.category = null;
                                                                        }
                                                                        return updatedLead;
                                                                    }
                                                                    return l;
                                                                }));
                                                                await axios.patch(`${API_URL}/api/leads/${lead.id}`, { type: val }, { withCredentials: true });
                                                            } catch (err) {
                                                                console.error(err);
                                                                setLeads(prevLeads);
                                                            }
                                                            setEditingCell(null);
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-6 w-full text-[10px] p-1">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="Yes">Yes</SelectItem>
                                                            <SelectItem value="No">No</SelectItem>
                                                            <SelectItem value="NA">NA</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <div
                                                        onClick={() => startEdit(lead.id, 'type', lead.type || 'NA')}
                                                        className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5"
                                                    >
                                                        {lead.type === 'Yes' && <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-green-100 text-green-700 border-green-300">Yes</Badge>}
                                                        {lead.type === 'No' && <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 border-red-300">No</Badge>}
                                                        {(lead.type === 'NA' || !lead.type) && <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-gray-100 text-gray-600 border-gray-300">NA</Badge>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1">
                                                {lead.type !== 'Yes' ? (
                                                    <span className="text-gray-400 text-[10px]">—</span>
                                                ) : editingCell?.leadId === lead.id && editingCell?.field === 'category' ? (
                                                    <Select
                                                        value={editValue}
                                                        onValueChange={async (val) => {
                                                            setEditValue(val);
                                                            if (val === 'Callback') {
                                                                setCallbackModalLead(lead);
                                                                setEditingCell(null);
                                                                return;
                                                            }
                                                            const prevLeads = [...leads];
                                                            try {
                                                                setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, category: val } : l));
                                                                await axios.patch(`${API_URL}/api/leads/${lead.id}`, { category: val }, { withCredentials: true });
                                                            } catch (err) {
                                                                console.error(err);
                                                                setLeads(prevLeads);
                                                            }
                                                            setEditingCell(null);
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-6 w-full text-[10px] p-1">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {CATEGORIES.map(cat => (
                                                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <div
                                                        onClick={() => startEdit(lead.id, 'category', lead.category || '')}
                                                        className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 min-w-[70px] min-h-[16px]"
                                                    >
                                                        {lead.category ? (
                                                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${getCategoryStyle(lead.category)}`}>
                                                                {lead.category}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400 text-[10px]">—</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1 text-gray-600">
                                                {lead.followUpDate ? new Date(lead.followUpDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}
                                            </td>
                                            <td className="px-2 py-1">
                                                {editingCell?.leadId === lead.id && editingCell?.field === 'priority' ? (
                                                    <Select
                                                        value={editValue}
                                                        onValueChange={async (val) => {
                                                            setEditValue(val);
                                                            const prevLeads = [...leads];
                                                            try {
                                                                setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, priority: val } : l));
                                                                await axios.patch(`${API_URL}/api/leads/${lead.id}`, { priority: val }, { withCredentials: true });
                                                            } catch (err) {
                                                                console.error(err);
                                                                setLeads(prevLeads);
                                                            }
                                                            setEditingCell(null);
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-6 w-full text-[10px] p-1">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="High">High</SelectItem>
                                                            <SelectItem value="Medium">Medium</SelectItem>
                                                            <SelectItem value="Low">Low</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <div
                                                        onClick={() => startEdit(lead.id, 'priority', lead.priority || 'Low')}
                                                        className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5"
                                                    >
                                                        <span className={`font-medium ${getPriorityColor(lead.priority)}`}>
                                                            {lead.priority || 'Low'}
                                                        </span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1">
                                                {editingCell?.leadId === (lead.id || lead._id) && editingCell?.field === 'chattingVia' ? (
                                                    <Select
                                                        value={editValue || "clear"}
                                                        onValueChange={async (val) => {
                                                            const newValue = val === "clear" ? "" : val;
                                                            setEditValue(newValue);
                                                            const prevLeads = [...leads];
                                                            const leadId = lead.id || lead._id;
                                                            console.log("Saving chattingVia:", newValue, "for lead:", leadId);
                                                            try {
                                                                setLeads(prev => prev.map(l => (l.id || l._id) === leadId ? { ...l, chattingVia: newValue } : l));
                                                                await axios.patch(`${API_URL}/api/leads/${leadId}`, { chattingVia: newValue }, { withCredentials: true });
                                                            } catch (err) {
                                                                console.error(err);
                                                                setLeads(prevLeads);
                                                            }
                                                            setEditingCell(null);
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-6 w-[100px] text-[10px] p-1">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="clear">Clear</SelectItem>
                                                            <SelectItem value="+91XXXXX5235">+91XXXXX5235</SelectItem>
                                                            <SelectItem value="+91XXXXX5533">+91XXXXX5533</SelectItem>
                                                            <SelectItem value="+91XXXXX0951">+91XXXXX0951</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <div
                                                        onClick={() => startEdit(lead.id || lead._id, 'chattingVia', lead.chattingVia || 'clear')}
                                                        className="cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 inline-block"
                                                    >
                                                        {lead.chattingVia ? (
                                                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                                                lead.chattingVia.endsWith('5235') ? 'bg-blue-100 text-blue-700 border-blue-300' :
                                                                lead.chattingVia.endsWith('5533') ? 'bg-purple-100 text-purple-700 border-purple-300' :
                                                                lead.chattingVia.endsWith('0951') ? 'bg-green-100 text-green-700 border-green-300' :
                                                                'bg-gray-100 text-gray-600 border-gray-300'
                                                            }`}>
                                                                {lead.chattingVia.slice(-4)}
                                                            </Badge>
                                                        ) : (
                                                            <span className="text-gray-400 text-[10px]">—</span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => navigate(`/leads/${lead.id}`)}
                                                        className="p-1 text-gray-400 hover:text-[#E8536A] hover:bg-[#FFF5F5] rounded transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit2 size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => setCallLogLead(lead)}
                                                        className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                                                        title="Call Log"
                                                    >
                                                        <PhoneCall size={12} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">Rows per page:</span>
                        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                            <SelectTrigger className="w-[70px] h-7 text-[11px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                                <SelectItem value="200">200</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">
                            Page {page + 1} of {totalPages || 1}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="h-7 px-2"
                        >
                            Prev
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            className="h-7 px-2"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </div>

            {/* Call Log Panel */}
            {callLogLead && (
                <CallLogPanel
                    lead={callLogLead}
                    onClose={() => setCallLogLead(null)}
                    onUpdate={fetchLeads}
                    teamMembers={teamMembers}
                />
            )}

            {/* Import Modal */}
            <ImportModal
                open={importModalOpen}
                onClose={() => setImportModalOpen(false)}
                onSuccess={() => { setImportModalOpen(false); fetchLeads(); }}
            />

            {/* Add Lead Modal */}
            <AddLeadModal
                open={addLeadModalOpen}
                onClose={() => setAddLeadModalOpen(false)}
                onSuccess={() => { setAddLeadModalOpen(false); fetchLeads(); }}
                teamMembers={teamMembers}
            />

            <CallbackSchedulerModal
                isOpen={!!callbackModalLead}
                onClose={() => setCallbackModalLead(null)}
                lead={callbackModalLead}
                onScheduled={() => {
                    setLeads(prev => prev.map(l => l.id === callbackModalLead.id ? { ...l, category: "Callback" } : l));
                    fetchLeads();
                }}
                onSkip={() => {
                    setLeads(prev => prev.map(l => l.id === callbackModalLead.id ? { ...l, category: "Callback" } : l));
                }}
            />
        </div>
    );
}
