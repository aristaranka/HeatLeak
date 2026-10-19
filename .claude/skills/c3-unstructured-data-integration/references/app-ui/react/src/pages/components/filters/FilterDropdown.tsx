/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

type FilterDropdownOption = string | { value: string; label: string };

function normalizeFilterOptions(options: FilterDropdownOption[]): { value: string; label: string }[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

type FilterDropdownSingleProps = {
  label: string;
  multi?: false;
  value: string | null;
  options: FilterDropdownOption[];
  onChange: (value: string | null) => void;
  placeholder?: string;
};

type FilterDropdownMultiProps = {
  label: string;
  multi: true;
  value: string[];
  options: FilterDropdownOption[];
  onChange: (value: string[]) => void;
  placeholder?: string;
};

type FilterDropdownProps = FilterDropdownSingleProps | FilterDropdownMultiProps;

export const FilterDropdown: React.FC<FilterDropdownProps> = (props) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const isMulti = props.multi === true;
  const placeholder = props.placeholder ?? t('common.all');
  const { label, options: rawOptions } = props;
  const options = normalizeFilterOptions(rawOptions);

  const triggerLabel = (() => {
    if (isMulti) {
      const selected = props.value;
      return selected.length === 0 ? label : `${label} (${selected.length})`;
    }

    return label;
  })();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-primary border-weak flex h-[38px] items-center gap-2 rounded-xs border px-3 py-2 text-sm transition-colors hover:bg-hover"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-primary whitespace-nowrap">{triggerLabel}</span>
        <ChevronDown
          className={`text-secondary text-xs transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          size={12}
        />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={t('common.closeDropdown')}
          />
          <div
            className="bg-menu border-weak rounded-xs shadow-menu absolute top-full left-0 z-20 mt-1 max-h-60 min-w-[140px] overflow-y-auto border"
            role="listbox"
            aria-multiselectable={isMulti}
          >
            <button
              type="button"
              className="text-secondary hover:bg-hover w-full cursor-pointer px-3 py-2 text-left text-sm"
              onClick={() => {
                if (isMulti) {
                  props.onChange([]);
                } else {
                  props.onChange(null);
                }
                setIsOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (isMulti) {
                    props.onChange([]);
                  } else {
                    props.onChange(null);
                  }
                  setIsOpen(false);
                }
              }}
            >
              {placeholder}
            </button>
            {options.map(({ value: optionValue, label: optionLabel }) => {
              const selected = isMulti ? props.value.includes(optionValue) : props.value === optionValue;
              return (
                <button
                  key={optionValue}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-hover ${
                    selected ? 'bg-accent-weak text-accent' : 'text-primary'
                  }`}
                  onClick={() => {
                    if (isMulti) {
                      const prev = props.value;
                      const next = selected ? prev.filter((v) => v !== optionValue) : [...prev, optionValue];
                      props.onChange(next);
                    } else {
                      props.onChange(optionValue);
                      setIsOpen(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isMulti) {
                        const prev = props.value;
                        const isSel = prev.includes(optionValue);
                        const next = isSel ? prev.filter((v) => v !== optionValue) : [...prev, optionValue];
                        props.onChange(next);
                      } else {
                        props.onChange(optionValue);
                        setIsOpen(false);
                      }
                    }
                  }}
                >
                  {optionLabel}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export type { FilterDropdownOption, FilterDropdownProps };
