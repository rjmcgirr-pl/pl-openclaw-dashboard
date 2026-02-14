/**
 * Tag Type Definitions
 * 
 * Defines types for the tagging system including:
 * - Tag data structure
 * - Tag filtering options
 * - Tag color definitions
 */

/** Available tag colors for visual differentiation (Tailwind color names) */
export type TagColor = 
  | 'slate' 
  | 'red' 
  | 'orange' 
  | 'amber' 
  | 'yellow' 
  | 'lime' 
  | 'green' 
  | 'emerald' 
  | 'teal' 
  | 'cyan' 
  | 'sky' 
  | 'blue' 
  | 'indigo' 
  | 'violet' 
  | 'purple' 
  | 'fuchsia' 
  | 'pink' 
  | 'rose';

/**
 * Tag data structure (Legacy - uses string ID and TagColor)
 * @deprecated Use Tag from '../components/TagBadge' for hex color support
 */
export interface TagLegacy {
  /** Unique identifier for the tag */
  id: string;
  /** Display name of the tag */
  name: string;
  /** Color for visual identification (Tailwind color name) */
  color: TagColor;
  /** Optional description */
  description?: string;
  /** When the tag was created */
  createdAt?: string;
  /** Usage count for sorting/prioritization */
  usageCount?: number;
}

/**
 * Tag data structure with hex color support
 * Used by TagBadge component (Ticket #43)
 */
export interface Tag {
  /** Unique numeric identifier for the tag */
  id: number;
  /** Display name of the tag */
  name: string;
  /** Hex color code (e.g., '#3B82F6') */
  color: string;
}

/** Tag with selection state for dropdowns */
export interface SelectableTag extends TagLegacy {
  /** Whether the tag is currently selected */
  selected: boolean;
}

/** Filter logic mode */
export type FilterMode = 'AND' | 'OR';

/** Tag filter state */
export interface TagFilterState {
  /** Currently selected tag IDs */
  selectedTagIds: string[];
  /** Search query for tag filtering */
  searchQuery: string;
  /** Filter mode (AND vs OR) */
  mode: FilterMode;
}

/** Props for tag filtering operations */
export interface TagFilterOptions {
  /** Maximum number of tags to display */
  maxVisible?: number;
  /** Whether to show tag counts */
  showCount?: boolean;
  /** Callback when a tag is clicked */
  onTagClick?: (tagId: string) => void;
  /** Custom className */
  className?: string;
}

/** Color configuration for tailwind classes */
export const TAG_COLOR_MAP: Record<TagColor, { bg: string; text: string; border: string; hover: string }> = {
  slate:   { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-200',   hover: 'hover:bg-slate-200' },
  red:     { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     hover: 'hover:bg-red-200' },
  orange:  { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200',  hover: 'hover:bg-orange-200' },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   hover: 'hover:bg-amber-200' },
  yellow:  { bg: 'bg-yellow-100',  text: 'text-yellow-700',  border: 'border-yellow-200',  hover: 'hover:bg-yellow-200' },
  lime:    { bg: 'bg-lime-100',    text: 'text-lime-700',    border: 'border-lime-200',    hover: 'hover:bg-lime-200' },
  green:   { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-200',   hover: 'hover:bg-green-200' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', hover: 'hover:bg-emerald-200' },
  teal:    { bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200',    hover: 'hover:bg-teal-200' },
  cyan:    { bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-200',    hover: 'hover:bg-cyan-200' },
  sky:     { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-200',     hover: 'hover:bg-sky-200' },
  blue:    { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',    hover: 'hover:bg-blue-200' },
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200',  hover: 'hover:bg-indigo-200' },
  violet:  { bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200',  hover: 'hover:bg-violet-200' },
  purple:  { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200',  hover: 'hover:bg-purple-200' },
  fuchsia: { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', border: 'border-fuchsia-200', hover: 'hover:bg-fuchsia-200' },
  pink:    { bg: 'bg-pink-100',    text: 'text-pink-700',    border: 'border-pink-200',    hover: 'hover:bg-pink-200' },
  rose:    { bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200',    hover: 'hover:bg-rose-200' },
};

/** Default tag color */
export const DEFAULT_TAG_COLOR: TagColor = 'slate';

/** Maximum number of tags per item */
export const MAX_TAGS_PER_ITEM = 5;

/** Maximum visible tags before overflow */
export const MAX_VISIBLE_TAGS = 3;

/** Mock tags for testing (hex color format) */
export const MOCK_TAGS: Tag[] = [
  { id: 1, name: 'Sprint 1', color: '#3B82F6' },
  { id: 2, name: 'Backend', color: '#10B981' },
  { id: 3, name: 'Urgent', color: '#EF4444' },
];
