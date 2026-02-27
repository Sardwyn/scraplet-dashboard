import React, { useEffect, useRef } from "react";

// V1 Google Font List
// Broad selection of popular fonts, various styles + display fonts.
export const GOOGLE_FONTS = [
    "Inter",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Oswald",
    "Bebas Neue", // Display
    "Orbitron", // Sci-fi
    "Anton", // Impact-like
    "Playfair Display", // Serif
    "Source Serif 4", // Serif
    "Rubik",
    "Manrope",
    "Fira Sans",
    "DM Sans",
    "Space Grotesk",
    "JetBrains Mono", // Monospace
    "Abril Fatface",
    "Merriweather",
    "Nunito",
    "Workbench", // Example gaming/retro font if available (actually let's stick to safe/popular ones)
    "Press Start 2P" // Pixel
];

// 300-900 range covers most variable or static font weights (Light to Black)
// We request all weights to allow users to just "bold" things without broken styles.
const WEIGHTS = "300;400;500;700;900";

// Helper to generate the Google Fonts URL
// Deduplicates and adds display=swap
export function getGoogleFontsUrl(fonts: string[]) {
    if (!fonts || fonts.length === 0) return null;

    // e.g. https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;700;900&family=Roboto...&display=swap
    const unique = Array.from(new Set(fonts)).sort();
    if (unique.length === 0) return null;

    const parts = unique.map(
        (family) => `family=${encodeURIComponent(family)}:wght@${WEIGHTS}`
    );

    return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

// React Component to inject the <link> tag
// Single instance management via ID
export function FontLoader({ fonts }: { fonts: string[] }) {
    // Debounce ref to avoid thrashing on rapid selection changes
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        // Debounce 500ms
        if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
            const url = getGoogleFontsUrl(fonts);
            const id = "scraplet-google-fonts";
            let link = document.getElementById(id) as HTMLLinkElement;

            if (!url) {
                if (link) link.remove();
                return;
            }

            if (!link) {
                link = document.createElement("link");
                link.id = id;
                link.rel = "stylesheet";
                document.head.appendChild(link);
            }

            if (link.href !== url) {
                link.href = url;
            }
        }, 500);

        return () => {
            if (timeoutRef.current) {
                window.clearTimeout(timeoutRef.current);
            }
        };
    }, [fonts]); // Deep comparison might be better if pass-by-reference changes often, but strings are fine if array ref stable-ish.

    return null;
}

// Helper to return a safe font stack
export function getFontStack(family?: string) {
    if (!family) return "sans-serif";
    // Quote family name if it contains spaces
    const quoted = family.includes(" ") ? `"${family}"` : family;

    if (family === "JetBrains Mono" || family === "Press Start 2P") {
        return `${quoted}, monospace`;
    }
    if (family === "Playfair Display" || family === "Source Serif 4" || family === "Merriweather" || family === "Abril Fatface") {
        return `${quoted}, serif`;
    }

    return `${quoted}, sans-serif`;
}
