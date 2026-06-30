import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Calendar, Sun } from 'lucide-react';
import LeadCard from '../components/LeadCard';

const API_URL = process.env.REACT_APP_API_URL;

export default function Today() {
    const { counts } = useOutletContext();
    const [leads, setLeads] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-IN', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });

    const fetchData = async () => {
        try {
            const [leadsRes, teamRes] = await Promise.all([
                axios.get(`${API_URL}/api/leads/today`, { withCredentials: true }),
                axios.get(`${API_URL}/api/team`, { withCredentials: true })
            ]);
            setLeads(leadsRes.data.leads || []);
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[#E8536A] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-in" data-testid="today-page">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#E8536A] flex items-center justify-center">
                    <Sun size={24} className="text-white" />
                </div>
                <div>
                    <h1 className="font-heading text-xl font-semibold text-gray-900">Today</h1>
                    <p className="text-[13px] text-gray-500">{dateStr}</p>
                </div>
                <div className="ml-auto">
                    <span className="text-[13px] text-gray-500">
                        {leads.length} follow-up{leads.length !== 1 ? 's' : ''} scheduled
                    </span>
                </div>
            </div>

            {/* Leads Grid */}
            {leads.length === 0 ? (
                <div className="bg-white rounded-[16px] shadow-sm border border-gray-100 p-8 text-center">
                    <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500 text-[14px]">No follow-ups scheduled for today</p>
                    <p className="text-gray-400 text-[12px] mt-1">Import leads or set follow-up dates to see them here</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leads.map(lead => (
                        <LeadCard
                            key={lead.id}
                            lead={lead}
                            teamMembers={teamMembers}
                            onUpdate={fetchData}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
