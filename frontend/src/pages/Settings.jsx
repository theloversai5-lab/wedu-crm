import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Settings as SettingsIcon, User, Lock, Shield, Check, Loader2, Calendar } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_API_URL;

const COLORS = ['#E8536A', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#EF4444', '#14B8A6', '#6366F1'];

export default function Settings() {
    const { user, isAdmin, checkAuth } = useAuth();

    // Profile
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [color, setColor] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);

    // Password
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordSaving, setPasswordSaving] = useState(false);

    // App settings
    const [dupDetection, setDupDetection] = useState(true);
    const [settingsLoading, setSettingsLoading] = useState(false);

    // Integrations
    const [googleConnected, setGoogleConnected] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    useEffect(() => {
        if (user) {
            setName(user.name || '');
            setEmail(user.email || '');
            setColor(user.color || '#E8536A');
        }
    }, [user]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/settings`, { withCredentials: true });
                setDupDetection(res.data.duplicateDetectionEnabled);
            } catch (e) {
                console.error('Failed to load settings');
            }
        };

        const fetchGoogleStatus = async () => {
            try {
                const res = await axios.get(`${API_URL}/api/auth/google/status`, { withCredentials: true });
                setGoogleConnected(res.data.connected);
            } catch (e) {
                console.error('Failed to load google status');
            }
        };

        fetchSettings();
        fetchGoogleStatus();

        // Check for success param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('google') === 'connected') {
            toast.success('✓ Google Calendar connected successfully!');
            // Remove param from url without reloading
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (urlParams.get('google') === 'error') {
            toast.error('Failed to connect Google Calendar.');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const handleProfileSave = async () => {
        setProfileSaving(true);
        try {
            const body = {};
            if (name !== user.name) body.name = name;
            if (email !== user.email) body.email = email;
            if (color !== user.color) body.color = color;
            if (Object.keys(body).length === 0) {
                toast.info('No changes to save');
                setProfileSaving(false);
                return;
            }
            await axios.put(`${API_URL}/api/auth/profile`, body, { withCredentials: true });
            await checkAuth();
            toast.success('Profile updated');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to update profile');
        }
        setProfileSaving(false);
    };

    const handlePasswordChange = async () => {
        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }
        setPasswordSaving(true);
        try {
            await axios.put(`${API_URL}/api/auth/password`, {
                currentPassword,
                newPassword,
            }, { withCredentials: true });
            toast.success('Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to change password');
        }
        setPasswordSaving(false);
    };

    const handleDupToggle = async (enabled) => {
        setSettingsLoading(true);
        try {
            await axios.put(`${API_URL}/api/settings`, {
                duplicateDetectionEnabled: enabled,
            }, { withCredentials: true });
            setDupDetection(enabled);
            toast.success(`Duplicate detection ${enabled ? 'enabled' : 'disabled'}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to update settings');
        }
        setSettingsLoading(false);
    };

    const handleGoogleConnect = async () => {
        setGoogleLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/auth/google`, { withCredentials: true });
            window.location.href = res.data.url;
        } catch (err) {
            toast.error('Failed to start Google Calendar connection');
            setGoogleLoading(false);
        }
    };

    const handleGoogleDisconnect = async () => {
        setGoogleLoading(true);
        try {
            await axios.delete(`${API_URL}/api/auth/google/disconnect`, { withCredentials: true });
            setGoogleConnected(false);
            toast.success('Google Calendar disconnected');
        } catch (err) {
            toast.error('Failed to disconnect Google Calendar');
        }
        setGoogleLoading(false);
    };

    return (
        <div className="max-w-2xl mx-auto py-6 px-4 space-y-6" data-testid="settings-page">
            <div className="flex items-center gap-2 mb-2">
                <SettingsIcon size={22} className="text-[#E8536A]" />
                <h1 className="text-xl font-heading font-semibold text-gray-900">Settings</h1>
            </div>

            {/* Profile Section */}
            <Section icon={User} title="Profile">
                <div className="space-y-3">
                    <Field label="Name">
                        <Input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="h-9 text-[13px] rounded-[8px]"
                            data-testid="settings-name-input"
                        />
                    </Field>
                    <Field label="Email">
                        <Input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="h-9 text-[13px] rounded-[8px]"
                            data-testid="settings-email-input"
                        />
                    </Field>
                    <Field label="Display Color">
                        <div className="flex items-center gap-2 flex-wrap">
                            {COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    data-testid={`color-${c.replace('#', '')}`}
                                    className={`w-7 h-7 rounded-full border-2 transition-all ${
                                        color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                                    }`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </Field>
                    <div className="flex justify-end pt-1">
                        <Button
                            onClick={handleProfileSave}
                            disabled={profileSaving}
                            className="bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[8px] text-[12px] h-9 px-5"
                            data-testid="save-profile-btn"
                        >
                            {profileSaving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Check size={14} className="mr-1.5" />}
                            Save Profile
                        </Button>
                    </div>
                </div>
            </Section>

            {/* Password Section */}
            <Section icon={Lock} title="Change Password">
                <div className="space-y-3">
                    <Field label="Current Password">
                        <Input
                            type="password"
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password"
                            className="h-9 text-[13px] rounded-[8px]"
                            data-testid="settings-current-password"
                        />
                    </Field>
                    <Field label="New Password">
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Min 6 characters"
                            className="h-9 text-[13px] rounded-[8px]"
                            data-testid="settings-new-password"
                        />
                    </Field>
                    <Field label="Confirm New Password">
                        <Input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="h-9 text-[13px] rounded-[8px]"
                            data-testid="settings-confirm-password"
                        />
                    </Field>
                    <div className="flex justify-end pt-1">
                        <Button
                            onClick={handlePasswordChange}
                            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                            className="bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[8px] text-[12px] h-9 px-5"
                            data-testid="change-password-btn"
                        >
                            {passwordSaving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Lock size={14} className="mr-1.5" />}
                            Change Password
                        </Button>
                    </div>
                </div>
            </Section>

            {/* App Settings (Admin Only) */}
            {isAdmin && (
                <Section icon={Shield} title="App Settings" badge="Admin">
                    <div className="flex items-center justify-between py-1">
                        <div>
                            <p className="text-[13px] font-medium text-gray-800">Duplicate Detection</p>
                            <p className="text-[11px] text-gray-500">Automatically detect duplicate leads during import and creation</p>
                        </div>
                        <Switch
                            checked={dupDetection}
                            onCheckedChange={handleDupToggle}
                            disabled={settingsLoading}
                            data-testid="duplicate-detection-toggle"
                        />
                    </div>
                </Section>
            )}

            {/* Integrations */}
            <Section icon={Calendar} title="Integrations">
                <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                            <Calendar size={18} className="text-[#4285F4]" />
                        </div>
                        <div>
                            <h3 className="text-[13px] font-medium text-gray-800 flex items-center gap-2">
                                Google Calendar
                                {googleConnected && <Check size={14} className="text-green-500" />}
                            </h3>
                            <p className="text-[11px] text-gray-500">
                                {googleConnected
                                    ? 'Callbacks will automatically appear in your Google Calendar.'
                                    : 'Sync your callback schedules directly to Google Calendar. Get notified before every call.'}
                            </p>
                        </div>
                    </div>
                    <div>
                        {googleConnected ? (
                            <Button
                                onClick={handleGoogleDisconnect}
                                disabled={googleLoading}
                                variant="outline"
                                className="h-8 text-[12px] text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600 rounded-[8px]"
                            >
                                {googleLoading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                                Disconnect
                            </Button>
                        ) : (
                            <Button
                                onClick={handleGoogleConnect}
                                disabled={googleLoading}
                                className="h-8 text-[12px] bg-[#4285F4] hover:bg-blue-600 text-white rounded-[8px]"
                            >
                                {googleLoading ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                                Connect Google Calendar
                            </Button>
                        )}
                    </div>
                </div>
            </Section>

            {/* Account Info */}
            <div className="bg-gray-50 rounded-[12px] p-4 text-[11px] text-gray-500 space-y-1">
                <p>Role: <span className="font-medium text-gray-700">{isAdmin ? 'Admin' : 'Team Member'}</span></p>
                <p>Account ID: <span className="font-mono text-gray-600">{user?.id?.slice(-8)}</span></p>
                <p className="text-[10px] text-gray-400 pt-1">Wed Us CRM v1.0</p>
            </div>
        </div>
    );
}

function Section({ icon: Icon, title, badge, children }) {
    return (
        <div className="bg-white border border-gray-100 rounded-[12px] overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 bg-gray-50/50">
                <Icon size={15} className="text-gray-500" />
                <h2 className="text-[13px] font-semibold text-gray-800">{title}</h2>
                {badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#E8536A] text-white">{badge}</span>}
            </div>
            <div className="p-4">{children}</div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div className="space-y-1">
            <label className="text-[11px] font-medium text-gray-600">{label}</label>
            {children}
        </div>
    );
}
