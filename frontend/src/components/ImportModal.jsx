import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Upload, FileSpreadsheet, X, Check, AlertTriangle, ChevronRight, ArrowLeftRight, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from './ui/select';

const API_URL = process.env.REACT_APP_API_URL;

const ACTIONS = [
    { value: 'skip', label: 'Skip', color: 'text-gray-600 bg-gray-50 border-gray-200' },
    { value: 'overwrite', label: 'Overwrite', color: 'text-orange-600 bg-orange-50 border-orange-200' },
    { value: 'import_anyway', label: 'Import Anyway', color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { value: 'merge', label: 'Merge', color: 'text-green-600 bg-green-50 border-green-200' },
];

const COMPARE_FIELDS = [
    { key: 'companyName', label: 'Company' },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'category', label: 'Category' },
    { key: 'mostCommonResponse', label: 'Last Response' },
];

export default function ImportModal({ open, onClose, onSuccess }) {
    const [step, setStep] = useState('upload'); // upload, preview, duplicateReview, done
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [columnMapping, setColumnMapping] = useState({});

    // Analyze results
    const [duplicates, setDuplicates] = useState([]);
    const [nonDupCount, setNonDupCount] = useState(0);
    const [analyzeErrors, setAnalyzeErrors] = useState([]);

    // Duplicate review state
    const [actions, setActions] = useState({});
    const [bulkAction, setBulkAction] = useState('');
    const [applyToAll, setApplyToAll] = useState(false);

    // Background import progress
    const [bgImporting, setBgImporting] = useState(false);
    const [bgImported, setBgImported] = useState(0);

    // Final results
    const [finalResult, setFinalResult] = useState(null);
    const [resolving, setResolving] = useState(false);

    const reset = () => {
        setStep('upload');
        setFile(null);
        setPreview(null);
        setError(null);
        setDragActive(false);
        setColumnMapping({});
        setDuplicates([]);
        setNonDupCount(0);
        setAnalyzeErrors([]);
        setActions({});
        setBulkAction('');
        setApplyToAll(false);
        setBgImporting(false);
        setBgImported(0);
        setFinalResult(null);
        setResolving(false);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
    }, []);

    const handleFile = async (selectedFile) => {
        const validTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(csv|xlsx|xls)$/i)) {
            setError('Please upload a CSV or Excel file');
            return;
        }
        setFile(selectedFile);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const res = await axios.post(`${API_URL}/api/leads/import/preview`, formData, {
                withCredentials: true,
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setPreview(res.data);
            
            const detectedColumns = res.data.columns;
            const initialMapping = {};
            detectedColumns.forEach(col => {
                const lower = col.toLowerCase().trim();
                if (['company', 'company name', 'name', 'firm', 'business name'].includes(lower)) initialMapping['companyName'] = col;
                else if (['phone', 'phone number', 'contact', 'mobile'].includes(lower)) initialMapping['phone'] = col;
                else if (['phone 2', 'alternate', 'secondary'].includes(lower)) initialMapping['phone2'] = col;
                else if (['city', 'location', 'region'].includes(lower)) initialMapping['city'] = col;
                else if (['category', 'type', 'vendor type', 'vendor'].includes(lower)) initialMapping['vendorType'] = col;
                else if (['profile', 'url', 'profile url', 'link', 'website'].includes(lower)) initialMapping['profileUrl'] = col;
                else if (['person', 'contact person', 'person name'].includes(lower)) initialMapping['personName'] = col;
            });
            setColumnMapping(initialMapping);
            
            setStep('preview');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to read file');
        }
    };

    // After "Confirm Import" — analyze for duplicates
    const handleAnalyze = async () => {
        if (!file) return;
        setError(null);
        setStep('analyzing');

        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const backendMapping = {};
            Object.entries(columnMapping).forEach(([crmField, csvCol]) => {
                if (csvCol && csvCol !== '_ignore_') {
                    backendMapping[csvCol] = crmField;
                }
            });
            formData.append('columnMapping', JSON.stringify(backendMapping));

            const res = await axios.post(`${API_URL}/api/leads/import/analyze`, formData, {
                withCredentials: true,
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const { nonDuplicates, duplicates: dups, errors: errs } = res.data;
            setAnalyzeErrors(errs || []);

            if (dups.length === 0) {
                // No duplicates — import all directly
                setBgImporting(true);
                const batchRes = await axios.post(`${API_URL}/api/leads/import/batch`, {
                    leads: nonDuplicates.map(nd => nd.data)
                }, { withCredentials: true });

                setFinalResult({
                    imported: batchRes.data.imported,
                    skipped: 0,
                    overwritten: 0,
                    merged: 0,
                    importedAnyway: 0,
                    errors: [...(errs || []), ...(batchRes.data.errors || [])],
                    totalErrors: (errs?.length || 0) + (batchRes.data.errors?.length || 0)
                });
                setBgImporting(false);
                setStep('done');
            } else {
                // Has duplicates — show review
                setDuplicates(dups);
                setNonDupCount(nonDuplicates.length);

                // Import non-duplicates in background
                if (nonDuplicates.length > 0) {
                    setBgImporting(true);
                    try {
                        const batchRes = await axios.post(`${API_URL}/api/leads/import/batch`, {
                            leads: nonDuplicates.map(nd => nd.data)
                        }, { withCredentials: true });
                        setBgImported(batchRes.data.imported);
                    } catch (e) {
                        console.error('Background import error:', e);
                    }
                    setBgImporting(false);
                }

                // Init actions — default to skip
                const initialActions = {};
                dups.forEach((_, idx) => { initialActions[idx] = 'skip'; });
                setActions(initialActions);
                setStep('duplicateReview');
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Analysis failed');
            setStep('preview');
        }
    };

    // Apply bulk action
    useEffect(() => {
        if (applyToAll && bulkAction) {
            const newActions = {};
            duplicates.forEach((_, idx) => { newActions[idx] = bulkAction; });
            setActions(newActions);
        }
    }, [applyToAll, bulkAction, duplicates]);

    const setAction = (idx, action) => {
        setActions(prev => ({ ...prev, [idx]: action }));
        if (applyToAll) setApplyToAll(false);
    };

    // Resolve duplicates and finalize
    const handleResolve = async () => {
        setResolving(true);
        try {
            const resolutions = duplicates.map((dup, idx) => ({
                action: actions[idx] || 'skip',
                incoming: dup.incoming,
                existingId: dup.existing.id,
            }));

            const res = await axios.post(`${API_URL}/api/leads/import/resolve`, {
                resolutions
            }, { withCredentials: true });

            setFinalResult({
                imported: bgImported,
                skipped: res.data.skipped,
                overwritten: res.data.overwritten,
                merged: res.data.merged,
                importedAnyway: res.data.importedAnyway,
                errors: [...analyzeErrors, ...(res.data.errors || [])],
                totalErrors: analyzeErrors.length + (res.data.errors?.length || 0)
            });
            setStep('done');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to resolve duplicates');
        }
        setResolving(false);
    };

    const allDecided = duplicates.length > 0 && Object.keys(actions).length === duplicates.length;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className={`flex flex-col max-h-[92vh] ${step === 'duplicateReview' ? 'sm:max-w-5xl' : 'sm:max-w-2xl'}`}>
                <DialogHeader>
                    <DialogTitle className="font-heading flex items-center gap-2 text-[15px]">
                        <FileSpreadsheet size={18} className="text-[#E8536A]" />
                        {step === 'duplicateReview' ? 'Review Duplicates' : 'Import Leads'}
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto">
                    {/* UPLOAD */}
                    {step === 'upload' && (
                        <div className="space-y-4">
                            <div
                                className={`border-2 border-dashed rounded-[12px] p-8 text-center transition-colors ${
                                    dragActive ? 'border-[#E8536A] bg-[#FFF5F5]' : 'border-gray-200 hover:border-gray-300'
                                }`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                            >
                                <Upload size={40} className="mx-auto text-gray-400 mb-4" />
                                <p className="text-[13px] text-gray-600 mb-2">Drag and drop your file here, or</p>
                                <label className="cursor-pointer">
                                    <span className="text-[#E8536A] font-medium hover:underline">browse</span>
                                    <input
                                        type="file"
                                        accept=".csv,.xlsx,.xls"
                                        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                                        className="hidden"
                                        data-testid="import-file-input"
                                    />
                                </label>
                                <p className="text-[11px] text-gray-400 mt-2">Supports CSV and Excel files (.csv, .xlsx, .xls)</p>
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg text-[12px]">
                                    <AlertTriangle size={14} />
                                    {error}
                                </div>
                            )}
                            <div className="bg-gray-50 rounded-[10px] p-4">
                                <h4 className="text-[12px] font-medium text-gray-700 mb-2">Import mapping</h4>
                                <div className="text-[11px] text-gray-500 space-y-1">
                                    <p>Select your CSV file to manually map columns to CRM fields.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PREVIEW */}
                    {step === 'preview' && preview && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between bg-green-50 px-4 py-2 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Check size={16} className="text-green-600" />
                                    <span className="text-[12px] text-green-700">
                                        File loaded: <strong>{file?.name}</strong>
                                    </span>
                                </div>
                                <span className="text-[12px] font-medium text-green-700">{preview.totalRows} rows found</span>
                            </div>
                            <div className="bg-gray-50 rounded-[10px] p-4">
                                <h4 className="text-[12px] font-medium text-gray-700 mb-3">Map Columns</h4>
                                <div className="space-y-2">
                                    {[
                                        { key: 'companyName', label: 'Company Name' },
                                        { key: 'phone', label: 'Phone 1 (Splits multiple numbers)' },
                                        { key: 'phone2', label: 'Phone 2' },
                                        { key: 'city', label: 'City' },
                                        { key: 'vendorType', label: 'Vendor Type (e.g. planners, decorators)' },
                                        { key: 'profileUrl', label: 'Profile URL' },
                                        { key: 'personName', label: 'Person Name' },
                                    ].map(field => (
                                        <div key={field.key} className="flex items-center justify-between bg-white p-2 rounded border border-gray-100">
                                            <span className="text-[11px] font-medium text-gray-700 w-1/3">{field.label}</span>
                                            <Select 
                                                value={columnMapping[field.key] || '_ignore_'} 
                                                onValueChange={(val) => setColumnMapping(prev => ({ ...prev, [field.key]: val }))}
                                            >
                                                <SelectTrigger className="w-2/3 h-7 text-[11px]">
                                                    <SelectValue placeholder="Select CSV Column" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="_ignore_">— Ignore —</SelectItem>
                                                    {preview.columns.map(col => (
                                                        <SelectItem key={col} value={col}>{col}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="text-[11px] font-medium text-gray-700 mb-2">Preview (first 10 rows)</h4>
                                <ScrollArea className="h-[200px] border border-gray-100 rounded-lg">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[10px]">
                                            <thead className="bg-gray-50 sticky top-0">
                                                <tr>
                                                    {preview.columns.map(col => (
                                                        <th key={col} className="px-2 py-1.5 text-left font-medium text-gray-600 whitespace-nowrap">{col}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.preview.map((row, idx) => (
                                                    <tr key={`preview-row-${idx}`} className="border-t border-gray-50">
                                                        {preview.columns.map(col => (
                                                            <td key={col} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[150px] truncate">{String(row[col] || '')}</td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ScrollArea>
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg text-[12px]">
                                    <AlertTriangle size={14} />{error}
                                </div>
                            )}
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={reset} className="rounded-[8px]">Cancel</Button>
                                <Button
                                    onClick={handleAnalyze}
                                    className="bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[8px]"
                                    data-testid="confirm-import-btn"
                                >
                                    Confirm Import ({preview.totalRows} Leads)
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* ANALYZING */}
                    {step === 'analyzing' && (
                        <div className="text-center py-8">
                            <Loader2 size={40} className="mx-auto text-[#E8536A] animate-spin mb-4" />
                            <p className="text-[13px] text-gray-600">Analyzing leads for duplicates...</p>
                            <p className="text-[11px] text-gray-400 mt-1">This may take a moment for large files</p>
                        </div>
                    )}

                    {/* DUPLICATE REVIEW */}
                    {step === 'duplicateReview' && (
                        <div className="space-y-3">
                            {/* Background import status */}
                            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg">
                                <div className="flex items-center gap-2">
                                    {bgImporting ? (
                                        <Loader2 size={14} className="text-blue-600 animate-spin" />
                                    ) : (
                                        <Check size={14} className="text-blue-600" />
                                    )}
                                    <span className="text-[11px] text-blue-700">
                                        {bgImporting
                                            ? `Importing ${nonDupCount} non-duplicate leads...`
                                            : `${bgImported} non-duplicate leads imported`
                                        }
                                    </span>
                                </div>
                                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                    {duplicates.length} duplicate{duplicates.length !== 1 ? 's' : ''} found
                                </span>
                            </div>

                            {/* Bulk action bar */}
                            <div className="flex items-center gap-3 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                                <div className="flex items-center gap-2" data-testid="apply-all-checkbox">
                                    <Checkbox
                                        checked={applyToAll}
                                        onCheckedChange={(v) => setApplyToAll(!!v)}
                                        id="apply-all"
                                    />
                                    <label htmlFor="apply-all" className="text-[11px] text-gray-700 cursor-pointer whitespace-nowrap">
                                        Apply to all remaining
                                    </label>
                                </div>
                                <Select value={bulkAction || undefined} onValueChange={(v) => { setBulkAction(v); if (applyToAll) setApplyToAll(true); }}>
                                    <SelectTrigger className="w-[140px] h-7 text-[11px] rounded-[6px]" data-testid="bulk-action-select">
                                        <SelectValue placeholder="Bulk action..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ACTIONS.map(a => (
                                            <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Duplicate pairs list */}
                            <ScrollArea className="h-[380px]">
                                <div className="space-y-2 pr-2">
                                    {duplicates.map((dup, idx) => (
                                        <DuplicateRow
                                            key={`dup-${dup.rowIndex}-${idx}`}
                                            dup={dup}
                                            index={idx}
                                            action={actions[idx] || 'skip'}
                                            onAction={(a) => setAction(idx, a)}
                                        />
                                    ))}
                                </div>
                            </ScrollArea>

                            {error && (
                                <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg text-[12px]">
                                    <AlertTriangle size={14} />{error}
                                </div>
                            )}

                            {/* Confirm */}
                            <div className="flex items-center justify-between pt-1">
                                <div className="text-[10px] text-gray-400">
                                    {Object.values(actions).filter(a => a === 'skip').length} skip,{' '}
                                    {Object.values(actions).filter(a => a === 'overwrite').length} overwrite,{' '}
                                    {Object.values(actions).filter(a => a === 'import_anyway').length} import anyway,{' '}
                                    {Object.values(actions).filter(a => a === 'merge').length} merge
                                </div>
                                <Button
                                    onClick={handleResolve}
                                    disabled={!allDecided || resolving}
                                    className="bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[8px] text-[12px] px-6"
                                    data-testid="resolve-confirm-btn"
                                >
                                    {resolving ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                                    Confirm Import
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* DONE */}
                    {step === 'done' && finalResult && (
                        <div className="space-y-4">
                            <div className="text-center py-3">
                                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                                    <Check size={28} className="text-green-600" />
                                </div>
                                <h3 className="font-heading text-lg font-semibold text-gray-900">Import Complete!</h3>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <StatCard label="Imported Fresh" value={finalResult.imported} color="green" />
                                <StatCard label="Skipped" value={finalResult.skipped} color="gray" />
                                <StatCard label="Overwritten" value={finalResult.overwritten} color="orange" />
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <StatCard label="Merged" value={finalResult.merged} color="teal" />
                                <StatCard label="Import Anyway" value={finalResult.importedAnyway} color="blue" />
                                <StatCard label="Errors" value={finalResult.totalErrors} color="red" />
                            </div>

                            {finalResult.errors?.length > 0 && (
                                <div className="bg-red-50 rounded-[10px] p-3">
                                    <h4 className="text-[11px] font-medium text-red-700 mb-2">Errors (first 10)</h4>
                                    <ScrollArea className="h-[80px]">
                                        <ul className="text-[10px] text-red-600 space-y-1">
                                            {finalResult.errors.slice(0, 10).map((err, idx) => (
                                                <li key={`err-${err.row || err.index || idx}`}>Row {err.row || err.index || '?'}: {err.reason}</li>
                                            ))}
                                        </ul>
                                    </ScrollArea>
                                </div>
                            )}

                            <div className="flex justify-end">
                                <Button
                                    onClick={() => { onSuccess(); reset(); }}
                                    className="bg-[#E8536A] hover:bg-[#D43D54] text-white rounded-[8px]"
                                    data-testid="import-done-btn"
                                >
                                    Done
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function StatCard({ label, value, color }) {
    const colors = {
        green: 'bg-green-50 text-green-600',
        gray: 'bg-gray-50 text-gray-600',
        orange: 'bg-orange-50 text-orange-600',
        teal: 'bg-teal-50 text-teal-600',
        blue: 'bg-blue-50 text-blue-600',
        red: 'bg-red-50 text-red-600',
    };
    const labelColors = {
        green: 'text-green-700',
        gray: 'text-gray-500',
        orange: 'text-orange-700',
        teal: 'text-teal-700',
        blue: 'text-blue-700',
        red: 'text-red-700',
    };
    return (
        <div className={`rounded-[10px] p-3 text-center ${colors[color]}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            <p className="text-xl font-bold">{value}</p>
            <p className={`text-[10px] ${labelColors[color]}`}>{label}</p>
        </div>
    );
}

function DuplicateRow({ dup, index, action, onAction }) {
    const { incoming, existing, matchReason } = dup;
    const activeStyle = ACTIONS.find(a => a.value === action);

    return (
        <div className={`border rounded-[10px] overflow-hidden transition-colors ${
            action === 'skip' ? 'border-gray-200' :
            action === 'overwrite' ? 'border-orange-200' :
            action === 'import_anyway' ? 'border-blue-200' :
            'border-green-200'
        }`} data-testid={`duplicate-row-${index}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-gray-500">#{dup.rowIndex}</span>
                    <span className="text-[10px] font-medium text-gray-700">{incoming.companyName || 'Unnamed'}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Match: {matchReason}</span>
                </div>
                <div className="flex items-center gap-1">
                    {ACTIONS.map(a => (
                        <button
                            key={a.value}
                            onClick={() => onAction(a.value)}
                            data-testid={`dup-${index}-action-${a.value}`}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                                action === a.value
                                    ? a.color + ' ring-1 ring-offset-1 ' + (a.value === 'skip' ? 'ring-gray-300' : a.value === 'overwrite' ? 'ring-orange-300' : a.value === 'import_anyway' ? 'ring-blue-300' : 'ring-green-300')
                                    : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Side by side comparison */}
            <div className="grid grid-cols-[1fr_auto_1fr] text-[11px]">
                {/* Header labels */}
                <div className="px-3 py-1 bg-blue-50/60 text-[10px] font-semibold text-blue-700">Incoming (File)</div>
                <div className="px-1 py-1 bg-gray-50 text-center"><ArrowLeftRight size={10} className="text-gray-300 mx-auto" /></div>
                <div className="px-3 py-1 bg-amber-50/60 text-[10px] font-semibold text-amber-700">Existing (Database)</div>

                {COMPARE_FIELDS.map(field => {
                    const inVal = incoming[field.key] || '-';
                    const exVal = existing[field.key] || '-';
                    const differs = inVal !== exVal && inVal !== '-' && exVal !== '-';
                    return (
                        <React.Fragment key={field.key}>
                            <div className={`px-3 py-1 border-t border-gray-50 ${differs ? 'bg-blue-50/30' : ''}`}>
                                <span className="text-[9px] text-gray-400 mr-1">{field.label}:</span>
                                <span className={differs ? 'font-medium text-blue-700' : 'text-gray-700'}>{inVal}</span>
                            </div>
                            <div className="border-t border-gray-50 bg-gray-50" />
                            <div className={`px-3 py-1 border-t border-gray-50 ${differs ? 'bg-amber-50/30' : ''}`}>
                                <span className="text-[9px] text-gray-400 mr-1">{field.label}:</span>
                                <span className={differs ? 'font-medium text-amber-700' : 'text-gray-700'}>{exVal}</span>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
}
