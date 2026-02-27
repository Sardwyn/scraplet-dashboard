import React, { useState, useMemo, useEffect, useRef } from "react";
import { GOOGLE_FONTS, getFontStack } from "../shared/FontManager";

interface FontPickerProps {
    value?: string;
    onChange: (font: string) => void;
    recentFonts?: string[];
}

export function FontPicker({ value, onChange, recentFonts = [] }: FontPickerProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return GOOGLE_FONTS.filter(f => f.toLowerCase().includes(q));
    }, [search]);

    const uniqueRecents = useMemo(() => {
        if (!recentFonts.length) return [];
        // Only show recents that are actually in our Google list (or custom if we had them)
        // And don't show if they are filtered out by search (optional, but good UX to search recents too)
        return recentFonts.filter(f =>
            GOOGLE_FONTS.includes(f) && f.toLowerCase().includes(search.toLowerCase())
        );
    }, [recentFonts, search]);

    // Recents might duplicate with "All Fonts" list if we just map both. 
    // Usually "Recent" is a separate section at top.

    const displayValue = value || "Default (Sans-Serif)";

    return (
        <div className="relative" ref={wrapperRef}>
            {/* Trigger */}
            <div
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs flex items-center justify-between cursor-pointer hover:border-slate-600"
                onClick={() => { setOpen(!open); setSearch(""); }}
            >
                <span className="truncate" style={{ fontFamily: value ? getFontStack(value) : undefined }}>
                    {displayValue}
                </span>
                <span className="text-slate-500 ml-2">▼</span>
            </div>

            {/* Dropdown */}
            {open && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl flex flex-col max-h-[300px]">
                    {/* Search */}
                    <div className="p-2 border-b border-slate-800">
                        <input
                            type="text"
                            autoFocus
                            placeholder="Search fonts..."
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
                        {/* Default Option */}
                        {!search && (
                            <div
                                className={`px-2 py-1.5 text-xs rounded cursor-pointer ${!value ? "bg-indigo-500/20 text-indigo-300" : "text-slate-300 hover:bg-slate-800"}`}
                                onClick={() => { onChange(""); setOpen(false); }}
                            >
                                Default (Sans-Serif)
                            </div>
                        )}

                        {/* Recent Section */}
                        {uniqueRecents.length > 0 && (
                            <>
                                <div className="px-2 py-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Recent</div>
                                {uniqueRecents.map(font => (
                                    <div
                                        key={`recent-${font}`}
                                        className={`px-2 py-1.5 text-xs rounded cursor-pointer ${value === font ? "bg-indigo-500/20 text-indigo-300" : "text-slate-200 hover:bg-slate-800"}`}
                                        style={{ fontFamily: getFontStack(font) }}
                                        onClick={() => { onChange(font); setOpen(false); }}
                                    >
                                        {font}
                                    </div>
                                ))}
                                <div className="h-px bg-slate-800 my-1" />
                            </>
                        )}

                        {/* All Fonts */}
                        <div className="px-2 py-1 text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">All Fonts</div>
                        {filtered.map(font => (
                            <div
                                key={font}
                                className={`px-2 py-1.5 text-xs rounded cursor-pointer ${value === font ? "bg-indigo-500/20 text-indigo-300" : "text-slate-200 hover:bg-slate-800"}`}
                                style={{ fontFamily: getFontStack(font) }}
                                onClick={() => { onChange(font); setOpen(false); }}
                            >
                                {font}
                            </div>
                        ))}

                        {filtered.length === 0 && (
                            <div className="px-2 py-4 text-center text-xs text-slate-500">
                                No fonts found.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
