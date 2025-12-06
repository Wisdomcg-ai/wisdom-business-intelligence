'use client';

import React from 'react';

interface Section1Props {
  formData: any;
  updateFormData: (data: any) => void;
  onNext: () => void;
}

function Section1Foundation({ formData, updateFormData, onNext }: Section1Props) {
  const handleChange = (field: string, value: string) => {
    updateFormData({ [field]: value });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Section 1: Business Foundation</h2>
      
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-3">1. What's your current annual revenue?</h3>
          <div className="space-y-2">
            <label className="flex items-center">
              <input type="radio" name="revenue_stage" value="foundation" className="mr-2" />
              Under $250K (Foundation Stage)
            </label>
            <label className="flex items-center">
              <input type="radio" name="revenue_stage" value="traction" className="mr-2" />
              $250K - $1M (Traction Stage)
            </label>
          </div>
        </div>
        
        <button 
          onClick={onNext}
          className="bg-brand-orange text-white px-6 py-2 rounded"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

export default Section1Foundation;