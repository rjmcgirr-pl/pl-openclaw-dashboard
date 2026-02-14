/**
 * TagSelector Component
 * 
 * Multi-select dropdown for tag selection with:
 * - Autocomplete search
 * - Inline tag creation
 * - 5-tag selection limit
 * - Keyboard navigation
 * - Accessibility support
 * 
 * @ticket #44
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Tag, SelectableTag, TagColor, TAG_COLOR_MAP, DEFAULT_TAG_COLOR, MAX_TAGS_PER_ITEM } from '../types/tag';

export interface TagSelectorProps {
  /** All available tags */
  availableTags: Tag[];
  /** Currently selected tag IDs */
  selectedTagIds: string[];
  /** Callback when selection changes */
  onSelectionChange: (selectedIds: string[]) => void;
  /** Callback when a new tag is created */
  onCreateTag?: (name: string, color: TagColor) => void;
  /** Maximum number of selectable tags */
  maxSelection?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Custom className */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

/**
 * Multi-select tag selector with autocomplete
 * 
 * @example
 * ```tsx
 * <TagSelector
 *   availableTags={tags}
 *   selectedTagIds={selectedIds}
 *   onSelectionChange={setSelectedIds}
 *   onCreateTag={handleCreateTag}
 *   maxSelection={5}
 * />
 * ```
 */
export const TagSelector: React.FC<TagSelectorProps> = ({
  availableTags,
  selectedTagIds,
  onSelectionChange,
  onCreateTag,
  maxSelection = 5,
  placeholder = 'Select or create tags...',
  disabled = false,
  className = '',
  size = 'md',
  autoFocus = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get selected tags
  const selectedTags = useMemo(() => {
    return availableTags.filter(tag => selectedTagIds.includes(tag.id));
  }, [availableTags, selectedTagIds]);

  // Check if at selection limit
  const atLimit = selectedTagIds.length >= maxSelection;

  // Filter available tags based on search
  const filteredTags = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return availableTags.filter(tag => !selectedTagIds.includes(tag.id));
    
    return availableTags.filter(tag => 
      !selectedTagIds.includes(tag.id) &&
      tag.name.toLowerCase().includes(query)
    );
  }, [availableTags, selectedTagIds, searchQuery]);

  // Check if we can create a new tag from current search
  const canCreateTag = useMemo(() => {
    const query = searchQuery.trim();
    if (!query || !onCreateTag) return false;
    
    // Don't allow creating if name already exists
    const exists = availableTags.some(tag => 
      tag.name.toLowerCase() === query.toLowerCase()
    );
    
    return !exists && !atLimit;
  }, [searchQuery, availableTags, onCreateTag, atLimit]);

  // Handle selection toggle
  const toggleTag = useCallback((tagId: string) => {
    if (disabled) return;
    
    const isSelected = selectedTagIds.includes(tagId);
    let newSelection: string[];
    
    if (isSelected) {
      newSelection = selectedTagIds.filter(id => id !== tagId);
    } else if (!atLimit) {
      newSelection = [...selectedTagIds, tagId];
    } else {
      return; // At limit, can't add more
    }
    
    onSelectionChange(newSelection);
    setSearchQuery('');
    inputRef.current?.focus();
  }, [disabled, selectedTagIds, atLimit, onSelectionChange]);

  // Handle creating new tag
  const handleCreateTag = useCallback(() => {
    if (!canCreateTag || !onCreateTag) return;
    
    const name = searchQuery.trim();
    // Cycle through colors for new tags
    const colors = Object.keys(TAG_COLOR_MAP) as TagColor[];
    const color = colors[availableTags.length % colors.length];
    
    onCreateTag(name, color);
    setSearchQuery('');
    
    // Add the new tag to selection once created
    // (parent should handle adding it to availableTags and selectedIds)
  }, [canCreateTag, onCreateTag, searchQuery, availableTags.length]);

  // Remove tag from selection
  const removeTag = useCallback((tagId: string) => {
    if (disabled) return;
    const newSelection = selectedTagIds.filter(id => id !== tagId);
    onSelectionChange(newSelection);
  }, [disabled, selectedTagIds, onSelectionChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setIsOpen(true);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredTags.length - 1 ? prev + 1 : 
          canCreateTag ? filteredTags.length : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredTags.length) {
          toggleTag(filteredTags[highlightedIndex].id);
        } else if (highlightedIndex === filteredTags.length && canCreateTag) {
          handleCreateTag();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case 'Backspace':
        if (searchQuery === '' && selectedTagIds.length > 0) {
          // Remove last selected tag
          removeTag(selectedTagIds[selectedTagIds.length - 1]);
        }
        break;
    }
  }, [isOpen, filteredTags, highlightedIndex, canCreateTag, searchQuery, selectedTagIds, toggleTag, handleCreateTag, removeTag]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Size classes
  const sizeClasses = {
    sm: {
      container: 'min-h-[32px]',
      input: 'text-xs',
      tag: 'text-xs px-2 py-0.5',
      dropdown: 'max-h-48',
    },
    md: {
      container: 'min-h-[40px]',
      input: 'text-sm',
      tag: 'text-sm px-2.5 py-1',
      dropdown: 'max-h-56',
    },
    lg: {
      container: 'min-h-[48px]',
      input: 'text-base',
      tag: 'text-base px-3 py-1.5',
      dropdown: 'max-h-64',
    },
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full ${className}`}
    >
      {/* Input container */}
      <div
        className={`
          flex flex-wrap items-center gap-1.5 p-2
          bg-white border border-gray-300 rounded-lg
          transition-all duration-150
          ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : 'hover:border-gray-400'}
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'cursor-text'}
          ${sizeClasses[size].container}
        `}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {/* Selected tags */}
        {selectedTags.map(tag => {
          const colors = TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate;
          return (
            <span
              key={tag.id}
              className={`
                inline-flex items-center gap-1 rounded-full font-medium
                ${colors.bg} ${colors.text} ${colors.border} border
                ${sizeClasses[size].tag}
              `}
            >
              {tag.name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag.id);
                }}
                disabled={disabled}
                className="inline-flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
                aria-label={`Remove ${tag.name}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          );
        })}

        {/* Input field */}
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
          disabled={disabled || atLimit}
          className={`
            flex-1 min-w-[80px] bg-transparent outline-none
            placeholder:text-gray-400
            ${sizeClasses[size].input}
            ${disabled || atLimit ? 'cursor-not-allowed' : ''}
          `}
        />

        {/* Limit indicator */}
        {selectedTags.length > 0 && (
          <span className="text-xs text-gray-400 ml-auto">
            {selectedTags.length}/{maxSelection}
          </span>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className={`
          absolute z-50 w-full mt-1
          bg-white border border-gray-200 rounded-lg shadow-lg
          overflow-hidden
          ${sizeClasses[size].dropdown}
        `}>
          {/* Search results */}
          {filteredTags.length > 0 ? (
            <ul className="py-1 overflow-auto">
              {filteredTags.map((tag, index) => {
                const colors = TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate;
                const isHighlighted = index === highlightedIndex;
                
                return (
                  <li
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`
                      flex items-center gap-2 px-3 py-2 cursor-pointer
                      transition-colors duration-100
                      ${isHighlighted ? 'bg-gray-100' : ''}
                    `}
                  >
                    <span className={`w-3 h-3 rounded-full ${colors.text.replace('text-', 'bg-').replace('700', '500')}`} />
                    <span className="flex-1 text-sm text-gray-700">{tag.name}</span>
                    {tag.usageCount !== undefined && tag.usageCount > 0 && (
                      <span className="text-xs text-gray-400">({tag.usageCount})</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-3 text-sm text-gray-500">
              {searchQuery ? 'No matching tags' : 'No available tags'}
            </div>
          )}

          {/* Create new tag option */}
          {canCreateTag && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={handleCreateTag}
                onMouseEnter={() => setHighlightedIndex(filteredTags.length)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-left
                  transition-colors duration-100
                  ${highlightedIndex === filteredTags.length ? 'bg-gray-100' : ''}
                `}
              >
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm text-gray-700">
                  Create "<span className="font-medium">{searchQuery.trim()}</span>"
                </span>
              </button>
            </div>
          )}

          {/* At limit warning */}
          {atLimit && (
            <div className="px-3 py-2 text-xs text-amber-600 bg-amber-50 border-t border-amber-100">
              Maximum {maxSelection} tags allowed. Remove a tag to add more.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Compact inline tag selector for minimal UI
 */
export interface InlineTagSelectorProps {
  availableTags: Tag[];
  selectedTagIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  onCreateTag?: (name: string, color: TagColor) => void;
  maxSelection?: number;
  disabled?: boolean;
  className?: string;
}

export const InlineTagSelector: React.FC<InlineTagSelectorProps> = ({
  availableTags,
  selectedTagIds,
  onSelectionChange,
  onCreateTag,
  maxSelection = 5,
  disabled = false,
  className = '',
}) => {
  const [isAdding, setIsAdding] = useState(false);
  
  if (!isAdding) {
    return (
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        disabled={disabled || selectedTagIds.length >= maxSelection}
        className={`
          inline-flex items-center gap-1 px-2 py-1 rounded-full
          text-sm text-gray-600 bg-gray-100 hover:bg-gray-200
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${className}
        `}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {selectedTagIds.length === 0 ? 'Add tags' : 'Add more'}
      </button>
    );
  }

  return (
    <div className={`w-full max-w-xs ${className}`}>
      <TagSelector
        availableTags={availableTags}
        selectedTagIds={selectedTagIds}
        onSelectionChange={(ids) => {
          onSelectionChange(ids);
          if (ids.length >= maxSelection) {
            setIsAdding(false);
          }
        }}
        onCreateTag={onCreateTag}
        maxSelection={maxSelection}
        size="sm"
        autoFocus
      />
      <button
        type="button"
        onClick={() => setIsAdding(false)}
        className="mt-1 text-xs text-gray-500 hover:text-gray-700"
      >
        Done
      </button>
    </div>
  );
};

export default TagSelector;
