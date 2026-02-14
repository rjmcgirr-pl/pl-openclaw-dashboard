/**
 * TagBadge Component
 * 
 * Pill-shaped badge for displaying tags with:
 * - Color-coded visual identification using hex colors
 * - Click to filter functionality
 * - Removable state with X button
 * - Size variants (sm, md, lg)
 * - Tooltip on hover showing full tag name
 * 
 * @ticket #43
 */

import React, { useMemo } from 'react';

/** Tag data structure */
export interface Tag {
  id: number;
  name: string;
  color: string;
}

/** Props for the TagBadge component */
export interface TagBadgeProps {
  /** Tag data to display */
  tag: Tag;
  /** Callback when tag is clicked */
  onClick?: (tagId: number) => void;
  /** Callback when remove button is clicked */
  onRemove?: (tagId: number) => void;
  /** Whether the tag can be removed */
  removable?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Converts hex color to rgba with opacity
 */
const hexToRgba = (hex: string, opacity: number): string => {
  // Remove # if present
  const cleanHex = hex.replace('#', '');
  
  // Parse r, g, b
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

/**
 * Individual tag badge component
 * 
 * @example
 * ```tsx
 * <TagBadge 
 *   tag={{ id: 1, name: 'Sprint 1', color: '#3B82F6' }} 
 *   onClick={(id) => setFilter(id)}
 * />
 * ```
 */
export const TagBadge: React.FC<TagBadgeProps> = ({
  tag,
  onClick,
  onRemove,
  removable = false,
  size = 'md',
}) => {
  const styles = useMemo(() => {
    const height = size === 'sm' ? '20px' : size === 'md' ? '24px' : '28px';
    const padding = size === 'sm' ? '4px 8px' : size === 'md' ? '6px 10px' : '8px 12px';
    const fontSize = '12px';
    
    return {
      container: {
        display: 'inline-flex',
        alignItems: 'center',
        height,
        padding,
        borderRadius: '9999px',
        backgroundColor: hexToRgba(tag.color, 0.15),
        color: tag.color,
        fontSize,
        fontWeight: 500,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        cursor: onClick ? 'pointer' : 'default',
        gap: '4px',
        lineHeight: '1',
        whiteSpace: 'nowrap' as const,
        userSelect: 'none' as const,
        transition: 'opacity 150ms ease-in-out',
      },
      removeButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size === 'sm' ? '14px' : '16px',
        height: size === 'sm' ? '14px' : '16px',
        borderRadius: '50%',
        border: 'none',
        backgroundColor: 'transparent',
        color: tag.color,
        cursor: 'pointer',
        padding: '0',
        marginLeft: '2px',
        transition: 'background-color 150ms ease-in-out',
      },
    };
  }, [tag.color, size, onClick]);

  const handleClick = () => {
    if (onClick) {
      onClick(tag.id);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(tag.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <span
      style={styles.container}
      onClick={handleClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={tag.name}
    >
      <span>{tag.name}</span>
      
      {removable && onRemove && (
        <button
          type="button"
          onClick={handleRemove}
          style={styles.removeButton}
          aria-label={`Remove ${tag.name} tag`}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = hexToRgba(tag.color, 0.25);
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <svg 
            width="10" 
            height="10" 
            viewBox="0 0 10 10" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              d="M1 1L9 9M1 9L9 1" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
};

/** Props for the TagBadgeGroup component */
export interface TagBadgeGroupProps {
  /** Array of tags to display */
  tags: Tag[];
  /** Maximum number of visible tags (default: 3) */
  maxVisible?: number;
  /** Callback when a tag is clicked */
  onTagClick?: (tagId: number) => void;
  /** Callback when overflow indicator is clicked */
  onOverflowClick?: () => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Gap between badges in pixels */
  gap?: number;
}

/**
 * Group of tag badges with overflow handling
 * 
 * Displays up to `maxVisible` tags, then shows +N indicator.
 * 
 * @example
 * ```tsx
 * <TagBadgeGroup
 *   tags={[
 *     { id: 1, name: 'Sprint 1', color: '#3B82F6' },
 *     { id: 2, name: 'Backend', color: '#10B981' },
 *     { id: 3, name: 'Urgent', color: '#EF4444' },
 *   ]}
 *   maxVisible={3}
 *   onTagClick={handleFilter}
 * />
 * ```
 */
export const TagBadgeGroup: React.FC<TagBadgeGroupProps> = ({
  tags,
  maxVisible = 3,
  onTagClick,
  onOverflowClick,
  size = 'md',
  gap = 6,
}) => {
  const visibleTags = tags.slice(0, maxVisible);
  const overflowCount = tags.length - maxVisible;
  const hasOverflow = overflowCount > 0;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: `${gap}px`,
  };

  const overflowStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: size === 'sm' ? '20px' : size === 'md' ? '24px' : '28px',
    padding: size === 'sm' ? '4px 8px' : size === 'md' ? '6px 10px' : '8px 12px',
    borderRadius: '9999px',
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
    color: '#6B7280',
    fontSize: '12px',
    fontWeight: 500,
    cursor: onOverflowClick ? 'pointer' : 'default',
    border: 'none',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    transition: 'background-color 150ms ease-in-out',
  };

  return (
    <div style={containerStyle}>
      {visibleTags.map((tag) => (
        <TagBadge
          key={tag.id}
          tag={tag}
          onClick={onTagClick}
          size={size}
        />
      ))}
      
      {hasOverflow && (
        <button
          type="button"
          onClick={onOverflowClick}
          style={overflowStyle}
          title={`${overflowCount} more tag${overflowCount === 1 ? '' : 's'}`}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(156, 163, 175, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(156, 163, 175, 0.2)';
          }}
        >
          +{overflowCount}
        </button>
      )}
    </div>
  );
};

export default TagBadge;
