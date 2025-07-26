// src/components/Node/DataTypeIcon.tsx
import React from 'react';

const iconMap: Record<string, React.JSX.Element> = {
    numeric: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Numeric</title>
            <line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line>
        </svg>
    ),
    text: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Text</title>
            <polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line>
        </svg>
    ),
    datetime: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Date/Time</title>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
    ),
    boolean: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Boolean</title>
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    ),
    json: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>JSON</title>
            <path d="M7 4a2 2 0 0 0 -2 2v3a2 3 0 0 1 -2 3a2 3 0 0 1 2 3v3a2 2 0 0 0 2 2" /><path d="M17 4a2 2 0 0 1 2 2v3a2 3 0 0 0 2 3a2 3 0 0 0 -2 3v3a2 2 0 0 1 -2 2" />
        </svg>
    ),
    array: (
         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Array</title>
            <rect x="7" y="7" width="10" height="10" rx="2" ry="2"></rect><path d="M17 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2"></path>
        </svg>
    ),
    uuid: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>UUID</title>
            <path d="M2 12h3m14 0h3M12 2v3m0 14v3" /><circle cx="12" cy="12" r="7" />
        </svg>
    ),
    binary: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Binary</title>
            <path d="M6 10v4" /><path d="M10.5 10h1.5c.8 0 1.5.7 1.5 1.5v1c0 .8-.7 1.5-1.5 1.5h-1.5" /><path d="M16 14v-4h2" /><path d="M18 10v4" />
        </svg>
    ),
    network: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Network</title>
            <circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
    ),
    geometric: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Geometric</title>
            <circle cx="12" cy="5" r="3"></circle><path d="M12 22V8"></path><path d="M5 12H2a10 10 0 0 0 20 0h-3"></path>
        </svg>
    ),
    default: (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Unknown</title>
            <circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
    ),
};

const keywordMap: Record<string, string[]> = {
    numeric: ["int", "numeric", "decimal", "serial", "double", "real", "money"],
    text: ["char", "text"],
    datetime: ["date", "time", "interval"],
    boolean: ["bool"],
    json: ["json"],
    array: ["[]"],
    uuid: ["uuid"],
    binary: ["bytea"],
    network: ["cidr", "inet", "macaddr"],
    geometric: ["point", "line", "lseg", "box", "path", "polygon", "circle"],
};

export const DataTypeIcon: React.FC<{ type: string }> = ({ type }) => {
    const typeLower = type.toLowerCase();
    const iconKey = Object.keys(keywordMap).find(key => 
        keywordMap[key].some(keyword => typeLower.includes(keyword))
    ) || 'default';

    return <div title={type}>{iconMap[iconKey]}</div>;
};
