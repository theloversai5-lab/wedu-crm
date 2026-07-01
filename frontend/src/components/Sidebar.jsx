import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
    LayoutDashboard, Calendar, CalendarDays, CalendarRange, Table2, 
    GitBranch, CheckCircle, PhoneCall, Clock, PhoneOff, Globe,
    Sparkles, HelpCircle, XCircle, Instagram, MessageCircle,
    CalendarCheck, Bell, MessageSquare, Users, Settings, LogOut, X, Menu
} from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';

const formatShortDate = (date) => {
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const baseNavItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', countKey: null },
    { icon: Calendar, label: 'Today', path: '/today', countKey: 'today', dateOffset: 0 },
    { icon: CalendarDays, label: 'Tomorrow', path: '/tomorrow', countKey: 'tomorrow', dateOffset: 1 },
    { icon: CalendarRange, label: 'This Week', path: '/this-week', countKey: 'thisWeek' },
    { icon: Table2, label: 'All Leads Table', path: '/leads', countKey: 'total' },

    { divider: true },
    { icon: CalendarCheck, label: 'Meeting Done', path: '/category/meeting-done', countKey: 'meetingDone' },
    { icon: Sparkles, label: 'Highly Interested', path: '/category/highly-interested', countKey: 'highlyInterested' },
    { icon: Users, label: 'MND', path: '/category/mnd', countKey: 'mnd' },
    { icon: GitBranch, label: 'Ongoing Project', path: '/category/ongoing-project', countKey: 'ongoingProject' },
    { icon: Globe, label: 'Send Portfolio', path: '/category/send-portfolio', countKey: 'sendPortfolio' },
    { icon: PhoneCall, label: 'Callback', path: '/category/callback', countKey: 'callback' },
    { icon: XCircle, label: 'Not Interested', path: '/category/not-interested', countKey: 'notInterested' },
    { divider: true },
    { icon: Instagram, label: 'Instagram Leads', path: '/instagram', countKey: 'instagram' },
    { icon: MessageCircle, label: 'WhatsApp Leads', path: '/whatsapp', countKey: 'whatsapp' },
    { divider: true },
    { icon: CalendarCheck, label: 'Meetings Calendar', path: '/calendar', countKey: null },
    { icon: Bell, label: 'Reminders', path: '/reminders', countKey: null },
    { icon: MessageSquare, label: 'Weekly Msgs', path: '/weekly-messages', countKey: null },
    { icon: Users, label: 'Team', path: '/team', countKey: null },
    { icon: Settings, label: 'Settings', path: '/settings', countKey: null },
];

const getNavItems = () => {
    const today = new Date();
    return baseNavItems.map(item => {
        if (item.dateOffset !== undefined) {
            const d = new Date(today);
            d.setDate(d.getDate() + item.dateOffset);
            return { ...item, dateLabel: formatShortDate(d) };
        }
        return item;
    });
};

export default function Sidebar({ counts, currentPath, user, isAdmin, onLogout, onClose, className, isMobile }) {
    const navItems = useMemo(() => getNavItems(), []);
    
    return (
        <div className={`w-60 bg-white border-r border-gray-100 h-screen flex flex-col ${className}`}>
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#E8536A] flex items-center justify-center">
                        <span className="text-white font-heading font-bold text-sm">W</span>
                    </div>
                    <span className="font-heading font-semibold text-gray-900 text-base">Wed Us CRM</span>
                </div>
                {isMobile && (
                    <button 
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-100 rounded-lg"
                        data-testid="close-sidebar-btn"
                    >
                        <X size={18} className="text-gray-500" />
                    </button>
                )}
            </div>

            {/* User Info */}
            <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                        style={{ backgroundColor: user?.color || '#E8536A' }}
                    >
                        {user?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 truncate">{user?.name || 'User'}</p>
                        <p className="text-[11px] text-gray-500 truncate">{isAdmin ? 'Admin' : 'Team Member'}</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1">
                <nav className="p-2 space-y-0.5">
                    {navItems.map((item, index) => {
                        if (item.divider) {
                            return <div key={`divider-${index}`} className="h-px bg-gray-100 my-2" />;
                        }

                        const Icon = item.icon;
                        const isActive = currentPath === item.path || 
                            (item.path !== '/dashboard' && currentPath.startsWith(item.path));
                        const count = item.countKey ? counts[item.countKey] : null;

                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={onClose}
                                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-[10px] transition-colors group ${
                                    isActive 
                                        ? 'bg-[#FFF5F5] text-[#E8536A]' 
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                }`}
                            >
                                <Icon size={16} className={isActive ? 'text-[#E8536A]' : 'text-gray-400 group-hover:text-gray-600'} />
                                <span className="text-[13px] font-medium flex-1">
                                    {item.label}
                                    {item.dateLabel && (
                                        <span className="text-[10px] font-normal text-gray-400 ml-1">· {item.dateLabel}</span>
                                    )}
                                </span>
                                {count !== null && count !== undefined && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center ${
                                        isActive 
                                            ? 'bg-[#E8536A] text-white' 
                                            : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>
            </ScrollArea>

            {/* Logout */}
            <div className="p-2 border-t border-gray-100">
                <button
                    onClick={onLogout}
                    data-testid="logout-btn"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] w-full text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                    <LogOut size={16} />
                    <span className="text-[13px] font-medium">Logout</span>
                </button>
            </div>
        </div>
    );
}
