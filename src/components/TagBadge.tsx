/**
 * TagBadge Component
 * 
 * Pill-shaped badge for displaying tags with:
 * - Color-coded visual identification
 * - Click to filter functionality
 * - Removable state with X button
 * - Size variants
 * - Max 3 visible with overflow indicator
 * 
 * @ticket #43
 */

import React, { useMemo } from 'react';
import { Tag, TAG_COLOR_MAP, TagColor } from '../types/tag';

export interface TagBadgeProps {
  /** Tag data to display */
  tag: Tag;
  /** Whether the tag is currently selected (for filtering) */
  isSelected?: boolean;
  /** Whether the tag can be removed */
  removable?: boolean;
  /** Callback when tag is clicked */
  onClick?: (tag: Tag) => void;
  /** Callback when remove button is clicked */
  onRemove?: (tagId: string) => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show count badge */
  showCount?: boolean;
  /** Custom className */
  className?: string;
  /** Disable interactions */
  disabled?: boolean;
}

/**
 * Individual tag badge component
 * 
 * @example
 * ```tsx
 * <TagBadge 
 *   tag={{ id: '1', name: 'urgent', color: 'red' }} 
 *   onClick={(tag) => setFilter(tag.id)}
 * />
 * ```
 */
export const TagBadge: React.FC<TagBadgeProps> = ({
  tag,
  isSelected = false,
  removable = false,
  onClick,
  onRemove,
  size = 'md',
  showCount = false,
  className = '',
  disabled = false,
}) => {
  const colors = TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate;

  const sizeClasses = useMemo(() => ({
    sm: {
      container: 'px-2 py-0.5 text-xs gap-1',
      icon: 'w-3 h-3',
      remove: 'w-3 h-3 -mr-0.5',
    },
    md: {
      container: 'px-2.5 py-1 text-sm gap-1.5',
      icon: 'w-3.5 h-3.5',
      remove: 'w-3.5 h-3.5 -mr-0.5',
    },
    lg: {
      container: 'px-3 py-1.5 text-base gap-2',
      icon: 'w-4 h-4',
      remove: 'w-4 h-4 -mr-0.5',
    },
  }), []);

  const baseClasses = `
    inline-flex items-center rounded-full border font-medium
    transition-all duration-150 ease-in-out
    ${sizeClasses[size].container}
    ${colors.bg}
    ${colors.text}
    ${colors.border}
    ${!disabled && onClick ? 'cursor-pointer' : 'cursor-default'}
    ${!disabled && onClick ? colors.hover : ''}
    ${isSelected ? 'ring-2 ring-offset-1 ring-blue-500' : ''}
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    ${className}
  `.trim();

  const handleClick = () => {
    if (!disabled && onClick) {
      onClick(tag);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled && onRemove) {
      onRemove(tag.id);
    }
  };

  return (
    <span
      className={baseClasses}
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      title={tag.description || tag.name}
    >
      {/* Color dot indicator */}
      <span
        className={`inline-block rounded-full ${sizeClasses[size].icon} ${colors.text.replace('text-', 'bg-').replace('700', '500')}`}
      />
      
      {/* Tag name */}
      <span className="truncate max-w-[120px]">{tag.name}</span>
      
      {/* Count badge */}
      {showCount && tag.usageCount !== undefined && tag.usageCount > 0 && (
        <span className="ml-0.5 text-xs opacity-70">({tag.usageCount})</span>
      )}
      
      {/* Remove button */}
      {removable && onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled}
          className={`
            inline-flex items-center justify-center rounded-full
            transition-colors duration-150
            ${sizeClasses[size].remove}
            ${colors.text}
            hover:bg-black/10
            focus:outline-none focus:ring-1 focus:ring-offset-0 focus:ring-blue-400
          `}
          aria-label={`Remove ${tag.name} tag`}
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
};

export interface TagBadgeGroupProps {
  /** Array of tags to display */
  tags: Tag[];
  /** Maximum number of visible tags */
  maxVisible?: number;
  /** Currently selected tag IDs (for filtering) */
  selectedTagIds?: string[];
  /** Callback when a tag is clicked */
  onTagClick?: (tag: Tag) => void;
  /** Callback when overflow indicator is clicked */
  onOverflowClick?: () => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show count badges */
  showCount?: boolean;
  /** Custom className for container */
  className?: string;
  /** Custom className for individual badges */
  badgeClassName?: string;
  /** Gap between badges */
  gap?: 'xs' | 'sm' | 'md' | 'lg';
}

/**
 * Group of tag badges with overflow handling
 * 
 * Displays up to `maxVisible` tags, then shows +N indicator.
 * 
 * @example
 * ```tsx
 * <TagBadgeGroup
 *   tags={taskTags}
 *   maxVisible={3}
 *   selectedTagIds={activeFilters}
 *   onTagClick={handleTagFilter}
 * />
 * ```
 */
export const TagBadgeGroup: React.FC<TagBadgeGroupProps> = ({
  tags,
  maxVisible = 3,
  selectedTagIds = [],
  onTagClick,
  onOverflowClick,
  size = 'md',
  showCount = false,
  className = '',
  badgeClassName = '',
  gap = 'sm',
}) => {
  const gapClasses = {
    xs: 'gap-1',
    sm: 'gap-1.5',
    md: 'gap-2',
    lg: 'gap-3',
  };

  const visibleTags = tags.slice(0, maxVisible);
  const overflowCount = tags.length - maxVisible;
  const hasOverflow = overflowCount > 0;

  return (
    <div className={`flex flex-wrap items-center ${gapClasses[gap]} ${className}`}>
      {visibleTags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          isSelected={selectedTagIds.includes(tag.id)}
          onClick={onTagClick}
          size={size}
          showCount={showCount}
          className={badgeClassName}
        />
      ))}
      
      {hasOverflow && (
        <OverflowBadge
          count={overflowCount}
          size={size}
          onClick={onOverflowClick}
        />
      )}
    </div>
  );
};

/** Overflow indicator component */
interface OverflowBadgeProps {
  count: number;
  size: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const OverflowBadge: React.FC<OverflowBadgeProps> = ({ count, size, onClick }) => {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-1 text-sm',
    lg: 'px-2.5 py-1.5 text-base',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        inline-flex items-center rounded-full
        bg-gray-100 text-gray-600 border border-gray-200
        font-medium transition-colors duration-150
        hover:bg-gray-200 hover:text-gray-700
        focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-300
        ${sizeClasses[size]}
      `}
      title={`${count} more tag${count === 1 ? '' : 's'}`}
    >
      +{count}
    </button>
  );
};

/**
 * Compact tag list for inline display
 * Shows tags without interaction, just visual indicators.
 */
export interface TagListProps {
  tags: Tag[];
  /** Maximum number to show */
  limit?: number;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Custom className */
  className?: string;
}

export const TagList: React.FC<TagListProps> = ({
  tags,
  limit = 3,
  size = 'sm',
  className = '',
}) => {
  const displayTags = tags.slice(0, limit);
  const remaining = tags.length - limit;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {displayTags.map((tag, index) => {
        const colors = TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.slate;
        return (
          <span
            key={tag.id}
            className={`
              inline-flex items-center rounded-full font-medium
              ${colors.bg} ${colors.text}
              ${sizeClasses[size]}
            `}
            title={tag.name}
          >
            {tag.name}
          </span>
        );
      })}
      {remaining > 0 && (
        <span className="text-xs text-gray-500">+{remaining}</span>
      )}
    </span>
  );
};

export default TagBadge;
