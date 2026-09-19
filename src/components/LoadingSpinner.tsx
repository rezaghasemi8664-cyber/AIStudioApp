import React from 'react';

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center h-full min-h-[300px]">
        <div className="w-12 h-12 border-4 border-t-transparent border-cyan-500 rounded-full animate-spin"></div>
    </div>
);

export default LoadingSpinner;
