import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Calendar, CalendarRange } from 'lucide-react';
import LeadCard from '../components/LeadCard';

const API_URL = process.env.REACT_APP_API_URL;

export default function ThisWeek() {
    const { counts } = useOutletContext();
    const [leadsByDate, setLeadsByDate] = useState({});
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const [leadsRes, teamRes] = await Promise.all([
                axios.get(`${API_URL}/api/leads/this-week`, { withCredentials: true }),
                axios.get(`${API_URL}/api/team`, { withCredentials: true })
            ]);

            const weekLeads = leadsRes.data.leads || [];

            // Group by date
            const grouped = {};
            weekLeads.forEach(lead => {
                const dateKey = new Date(lead.followUpDate).toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                });
                if (!grouped[dateKey]) {
                    grouped[dateKey] = {
                        date: new Date(lead.followUpDate),
                        leads: []
                    };
                }
                grouped[dateKey].leads.push(lead);
            });

            // Sort date groups chronologically
            const sortedGrouped = {};
            Object.keys(grouped)
                .sort((a, b) => grouped[a].date.getTime() - grouped[b].date.getTime())
                .forEach(key => {
                    sortedGrouped[key] = grouped[key];
                });

            setLeadsByDate(sortedGrouped);
            setTeamMembers(teamRes.data);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const totalLeads = Object.values(leadsByDate).reduce((sum, group) => sum + group.leads.length, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[#E8536A] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in" data-testid="this-week-page">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                    <CalendarRange size={24} className="text-white" />
                </div>
                <div>
                    <h1 className="font-heading text-xl font-semibold text-gray-900">This Week</h1>
                    <p className="text-[13px] text-gray-500">Next 7 days</p>
                </div>
                <div className="ml-auto">
                    <span className="text-[13px] text-gray-500">
                        {totalLeads} follow-up{totalLeads !== 1 ? 's' : ''} scheduled
                    </span>
                </div>
            </div>

            {/* Date Groups */}
            {totalLeads === 0 ? (
                <div className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-8 text-center">
                    <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 text-[14px]">No follow-ups scheduled this week</p>
                    <p className="text-gray-400 text-[12px] mt-1">Set follow-up dates on leads to see them here</p>
                </div>
            ) : (
                Object.entries(leadsByDate).map(([dateKey, group]) => {
                    const isToday = new Date(group.date).toDateString() === new Date().toDateString();
                    const isTomorrow = new Date(group.date).toDateString() === new Date(Date.now() + 86400000).toDateString();
                    
                    return (
                        <div key={dateKey} className="space-y-4">
                            {/* Date Header */}
                            <div className="flex items-center gap-3">
                                <h2 className="font-heading text-lg font-semibold text-gray-800">
                                    {dateKey}
                                    {isToday && <span className="ml-2 text-[12px] font-normal text-[#E8536A] bg-[#FFF5F5] px-2 py-0.5 rounded-full">Today</span>}
                                    {isTomorrow && <span className="ml-2 text-[12px] font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Tomorrow</span>}
                                </h2>
                                <span className="text-[12px] text-gray-400">
                                    {group.leads.length} lead{group.leads.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Leads Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {group.leads.map(lead => (
                                    <LeadCard
                                        key={lead.id}
                                        lead={lead}
                                        teamMembers={teamMembers}
                                        onUpdate={fetchData}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}
