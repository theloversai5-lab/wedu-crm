import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
    ChevronLeft, ChevronRight, Phone, Search, 
    X, Plus, Calendar as CalendarIcon, Clock, ChevronDown, Trash2
} from 'lucide-react';
import { toast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import CallbackSchedulerModal from '../components/CallbackSchedulerModal';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from '../components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../components/ui/popover';

const API_URL = process.env.REACT_APP_API_URL;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

const getPriorityColor = (priority) => {
    const colors = {
        'Highest': 'text-red-600 bg-red-50 border-red-200',
        'High': 'text-orange-600 bg-orange-50 border-orange-200',
        'Medium': 'text-yellow-600 bg-yellow-50 border-yellow-200',
        'Low': 'text-green-600 bg-green-50 border-green-200',
        'Review': 'text-blue-600 bg-blue-50 border-blue-200',
        'Archive': 'text-gray-500 bg-gray-50 border-gray-200'
    };
    return colors[priority] || 'text-gray-600 bg-gray-100';
};

export default function Calendar() {
    const navigate = useNavigate();
    
    // Calendar state
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Panel state
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    
    // Add Callback state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [schedulingLead, setSchedulingLead] = useState(null);

    // Compute calendar grid
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year, month) => {
        let day = new Date(year, month, 1).getDay();
        return day === 0 ? 6 : day - 1; // Convert Sunday=0 to Monday=0
    };

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    // Fetch leads for the current month
    useEffect(() => {
        const fetchLeads = async () => {
            setLoading(true);
            try {
                // Pad range a bit to ensure timezone edges are covered
                const start = new Date(year, month, 1);
                start.setHours(0, 0, 0, 0);
                const end = new Date(year, month + 1, 0);
                end.setHours(23, 59, 59, 999);
                
                const res = await axios.get(`${API_URL}/api/leads`, {
                    params: {
                        followUpFrom: start.toISOString(),
                        followUpTo: end.toISOString(),
                        limit: 1000 // Get all for the month
                    },
                    withCredentials: true
                });
                console.log("Calendar leads fetched:", res.data.leads);
                res.data.leads.forEach(l => {
                    console.log("Lead followUpDate:", l.companyName, l.followUpDate);
                });
                setLeads(res.data.leads || []);
            } catch (err) {
                console.error("Failed to fetch calendar leads:", err);
            }
            setLoading(false);
        };

        fetchLeads();
    }, [year, month]);

    // Handle month navigation
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const goToday = () => setCurrentDate(new Date());

    // Search leads for "+ Add Callback"
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!searchQuery) {
                setSearchResults([]);
                return;
            }
            setIsSearching(true);
            try {
                const res = await axios.get(`${API_URL}/api/leads`, {
                    params: { search: searchQuery, limit: 5 },
                    withCredentials: true
                });
                setSearchResults(res.data.leads || []);
            } catch (e) {}
            setIsSearching(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Group leads by date string
    const leadsByDate = useMemo(() => {
        const map = {};
        leads.forEach(lead => {
            if (!lead.followUpDate) return;
            const dateStr = new Date(lead.followUpDate).toDateString();
            if (!map[dateStr]) map[dateStr] = [];
            map[dateStr].push(lead);
        });
        return map;
    }, [leads]);

    const handleDateClick = (dayNum) => {
        const d = new Date(year, month, dayNum);
        const dateStr = d.toDateString();
        
        setSelectedDate({
            dateObj: d,
            dateStr: dateStr
        });
        setIsPanelOpen(true);
    };

    const handleCancelCallback = async (lead) => {
        if (!window.confirm("Cancel this callback? This will also remove it from Google Calendar.")) return;
        
        const leadId = lead._id || lead.id;
        
        // Optimistic update BEFORE api call
        const prevLeads = [...leads];
        setLeads(prev => prev.filter(l => (l._id || l.id) !== leadId));
        
        try {
            await axios.patch(`${API_URL}/api/leads/${leadId}`, {
                followUpDate: null,
                category: null,
                type: "NA"
            }, { withCredentials: true });
            
            toast({
                title: "Success",
                description: "Callback cancelled and removed from Google Calendar",
            });
        } catch (e) {
            console.error(e);
            // Revert optimistic update
            setLeads(prevLeads);
            toast({
                title: "Error",
                description: "Failed to cancel callback",
                variant: "destructive"
            });
        }
    };

    const formatTime = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const selectedLeads = selectedDate ? (leadsByDate[selectedDate.dateStr] || []) : [];

    const formatPanelHeader = (dateObj) => {
        if (!dateObj) return '';
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
        const dateNum = dateObj.getDate();
        const monthName = MONTHS[dateObj.getMonth()];
        return `${dayName}, ${dateNum} ${monthName}`;
    };

    return (
        <div className="h-full flex flex-col bg-[#FFF5F5] rounded-xl p-4 overflow-hidden relative">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-semibold text-gray-800">
                        {MONTHS[month]} {year}
                    </h1>
                    <div className="flex items-center gap-1 bg-white rounded-md border border-gray-200 p-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                            <ChevronLeft size={16} />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-3 text-xs" onClick={goToday}>
                            Today
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
                            <ChevronRight size={16} />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
                    {DAYS.map(d => (
                        <div key={d} className="py-3 text-center text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7 flex-1 auto-rows-fr">
                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="border-r border-b border-gray-50 bg-gray-50/30" />
                    ))}
                    
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const d = new Date(year, month, dayNum);
                        const dateStr = d.toDateString();
                        
                        const dayLeads = leadsByDate[dateStr] || [];
                        const isToday = new Date().toDateString() === dateStr;
                        
                        const isSelected = selectedDate && selectedDate.dateStr === dateStr;

                        return (
                            <div 
                                key={dayNum}
                                onClick={() => handleDateClick(dayNum)}
                                className={`border-r border-b border-gray-50 p-2 cursor-pointer transition-colors relative flex flex-col items-center
                                    ${isSelected ? 'bg-red-50/20' : dayLeads.length > 0 ? 'bg-gray-50/30 hover:bg-gray-50' : 'hover:bg-gray-50'}
                                `}
                            >
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium
                                    ${isToday || isSelected ? 'bg-[#E8536A] text-white' : 'text-gray-700'}
                                `}>
                                    {dayNum}
                                </span>
                                
                                {dayLeads.length > 0 && (
                                    <div className="mt-1 flex flex-col items-center gap-1">
                                        {dayLeads.length === 1 ? (
                                            <div className="w-1.5 h-1.5 rounded-full bg-[#E8536A]"></div>
                                        ) : (
                                            <div className="px-1 py-[1px] rounded bg-[#E8536A] text-white text-[9px] font-bold leading-none">
                                                {dayLeads.length}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right Side Panel */}
            <div className={`absolute top-0 right-0 h-full w-[400px] bg-white shadow-2xl border-l border-gray-100 transition-transform duration-300 transform ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="h-full flex flex-col">
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                        <h2 className="text-lg font-semibold text-gray-800">
                            {formatPanelHeader(selectedDate?.dateObj)}
                        </h2>
                        <Button variant="ghost" size="icon" onClick={() => setIsPanelOpen(false)}>
                            <X size={18} />
                        </Button>
                    </div>
                    
                    <ScrollArea className="flex-1 p-4">
                        {selectedLeads.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 flex flex-col items-center">
                                <CalendarIcon size={32} className="mb-3 text-gray-300" />
                                <p>No callbacks scheduled for this day</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {selectedLeads.map(lead => (
                                    <div 
                                        key={lead._id || lead.id} 
                                        className="border border-gray-100 rounded-xl p-3 hover:border-gray-200 cursor-pointer transition-colors"
                                        onClick={() => navigate(`/leads/${lead._id || lead.id}`)}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-semibold text-gray-800">{lead.companyName}</h3>
                                                <p className="text-xs text-gray-500">{lead.personName}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1 text-[#E8536A] text-xs font-medium bg-red-50 px-2 py-1 rounded-md">
                                                    <Clock size={12} />
                                                    {formatTime(lead.followUpDate)}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCancelCallback(lead);
                                                    }}
                                                    className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded transition-colors"
                                                    title="Cancel Callback"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mb-3">
                                            <a 
                                                href={`tel:${lead.phone}`}
                                                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-blue-600 px-2 py-1 bg-gray-50 rounded border border-gray-100"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <Phone size={12} />
                                                {lead.phone}
                                            </a>
                                            {lead.vendorType && (
                                                <Badge variant="outline" className="text-[10px] font-normal text-gray-500 border-gray-200">
                                                    {lead.vendorType}
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {lead.priority && (
                                                <Badge variant="outline" className={`text-[10px] border px-1.5 ${getPriorityColor(lead.priority)}`}>
                                                    {lead.priority}
                                                </Badge>
                                            )}
                                            {lead.category && (
                                                <Badge variant="outline" className={`text-[10px] border px-1.5 ${getCategoryStyle(lead.category)}`}>
                                                    {lead.category}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                    
                    <div className="p-4 border-t border-gray-100">
                        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                            <PopoverTrigger asChild>
                                <Button className="w-full bg-[#E8536A] hover:bg-[#D43D54] text-white">
                                    <Plus size={16} className="mr-2" />
                                    Add Callback
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[360px] p-0" align="end" sideOffset={10}>
                                <Command>
                                    <CommandInput 
                                        placeholder="Search lead by company name..." 
                                        value={searchQuery}
                                        onValueChange={setSearchQuery}
                                    />
                                    <CommandList>
                                        <CommandEmpty>{isSearching ? 'Searching...' : 'No leads found.'}</CommandEmpty>
                                        <CommandGroup>
                                            {searchResults.map((lead) => (
                                                <CommandItem
                                                    key={lead._id || lead.id}
                                                    value={lead.companyName}
                                                    onSelect={() => {
                                                        setSchedulingLead(lead);
                                                        setSearchOpen(false);
                                                    }}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{lead.companyName}</span>
                                                        <span className="text-xs text-gray-500">{lead.phone}</span>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>
            
            {schedulingLead && (
                <CallbackSchedulerModal
                    isOpen={!!schedulingLead}
                    onClose={() => setSchedulingLead(null)}
                    lead={schedulingLead}
                    onScheduled={() => {
                        // Refresh calendar by re-triggering the fetch
                        setCurrentDate(new Date(year, month, 1));
                    }}
                />
            )}
        </div>
    );
}
