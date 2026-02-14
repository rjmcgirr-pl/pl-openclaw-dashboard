/**
 * TagBadge Component Tests
 * 
 * @ticket #43
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TagBadge, TagBadgeGroup } from './TagBadge';
import type { Tag } from './TagBadge';

/** Mock data for testing */
const mockTags: Tag[] = [
  { id: 1, name: 'Sprint 1', color: '#3B82F6' },
  { id: 2, name: 'Backend', color: '#10B981' },
  { id: 3, name: 'Urgent', color: '#EF4444' },
  { id: 4, name: 'Frontend', color: '#8B5CF6' },
  { id: 5, name: 'Documentation', color: '#F59E0B' },
];

describe('TagBadge', () => {
  const defaultTag = mockTags[0];

  describe('rendering', () => {
    it('renders the tag name', () => {
      render(<TagBadge tag={defaultTag} />);
      expect(screen.getByText('Sprint 1')).toBeInTheDocument();
    });

    it('displays the full tag name as tooltip', () => {
      render(<TagBadge tag={defaultTag} />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveAttribute('title', 'Sprint 1');
    });

    it('applies correct background color with 15% opacity', () => {
      render(<TagBadge tag={defaultTag} />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveStyle({ backgroundColor: 'rgba(59, 130, 246, 0.15)' });
    });

    it('applies correct text color (100% opacity)', () => {
      render(<TagBadge tag={defaultTag} />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveStyle({ color: '#3B82F6' });
    });

    it('renders with pill shape (border-radius: 9999px)', () => {
      render(<TagBadge tag={defaultTag} />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveStyle({ borderRadius: '9999px' });
    });
  });

  describe('size variants', () => {
    it('renders small size with correct height', () => {
      render(<TagBadge tag={defaultTag} size="sm" />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveStyle({ height: '20px' });
    });

    it('renders medium size with correct height', () => {
      render(<TagBadge tag={defaultTag} size="md" />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveStyle({ height: '24px' });
    });

    it('renders large size with correct height', () => {
      render(<TagBadge tag={defaultTag} size="lg" />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveStyle({ height: '28px' });
    });

    it('renders medium size by default', () => {
      render(<TagBadge tag={defaultTag} />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveStyle({ height: '24px' });
    });
  });

  describe('click interactions', () => {
    it('calls onClick with tag id when clicked', () => {
      const handleClick = jest.fn();
      render(<TagBadge tag={defaultTag} onClick={handleClick} />);
      
      fireEvent.click(screen.getByText('Sprint 1').parentElement!);
      expect(handleClick).toHaveBeenCalledWith(1);
    });

    it('does not call onClick when not provided', () => {
      render(<TagBadge tag={defaultTag} />);
      const badge = screen.getByText('Sprint 1').parentElement;
      
      // Should not throw
      expect(() => fireEvent.click(badge!)).not.toThrow();
    });

    it('calls onClick when Enter key is pressed', () => {
      const handleClick = jest.fn();
      render(<TagBadge tag={defaultTag} onClick={handleClick} />);
      
      const badge = screen.getByText('Sprint 1').parentElement;
      fireEvent.keyDown(badge!, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledWith(1);
    });

    it('calls onClick when Space key is pressed', () => {
      const handleClick = jest.fn();
      render(<TagBadge tag={defaultTag} onClick={handleClick} />);
      
      const badge = screen.getByText('Sprint 1').parentElement;
      fireEvent.keyDown(badge!, { key: ' ' });
      expect(handleClick).toHaveBeenCalledWith(1);
    });

    it('has button role when onClick is provided', () => {
      render(<TagBadge tag={defaultTag} onClick={() => {}} />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveAttribute('role', 'button');
    });

    it('is focusable when onClick is provided', () => {
      render(<TagBadge tag={defaultTag} onClick={() => {}} />);
      const badge = screen.getByText('Sprint 1').parentElement;
      expect(badge).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('removable state', () => {
    it('shows remove button when removable is true', () => {
      render(<TagBadge tag={defaultTag} removable onRemove={() => {}} />);
      expect(screen.getByLabelText('Remove Sprint 1 tag')).toBeInTheDocument();
    });

    it('does not show remove button when removable is false', () => {
      render(<TagBadge tag={defaultTag} onRemove={() => {}} />);
      expect(screen.queryByLabelText('Remove Sprint 1 tag')).not.toBeInTheDocument();
    });

    it('calls onRemove with tag id when remove button is clicked', () => {
      const handleRemove = jest.fn();
      const handleClick = jest.fn();
      render(
        <TagBadge 
          tag={defaultTag} 
          removable 
          onRemove={handleRemove} 
          onClick={handleClick}
        />
      );
      
      const removeButton = screen.getByLabelText('Remove Sprint 1 tag');
      fireEvent.click(removeButton);
      
      expect(handleRemove).toHaveBeenCalledWith(1);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('stop propagation when clicking remove button', () => {
      const handleRemove = jest.fn();
      const handleClick = jest.fn();
      render(
        <TagBadge 
          tag={defaultTag} 
          removable 
          onRemove={handleRemove} 
          onClick={handleClick}
        />
      );
      
      const removeButton = screen.getByLabelText('Remove Sprint 1 tag');
      // Remove button click should not trigger parent click
      fireEvent.click(removeButton);
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has correct aria-label on remove button', () => {
      render(<TagBadge tag={defaultTag} removable onRemove={() => {}} />);
      const removeButton = screen.getByLabelText('Remove Sprint 1 tag');
      expect(removeButton).toHaveAttribute('type', 'button');
    });
  });
});

describe('TagBadgeGroup', () => {
  describe('rendering', () => {
    it('renders all tags when count is less than maxVisible', () => {
      render(<TagBadgeGroup tags={mockTags.slice(0, 2)} maxVisible={3} />);
      expect(screen.getByText('Sprint 1')).toBeInTheDocument();
      expect(screen.getByText('Backend')).toBeInTheDocument();
      expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
    });

    it('renders maxVisible tags and overflow indicator', () => {
      render(<TagBadgeGroup tags={mockTags} maxVisible={3} />);
      
      expect(screen.getByText('Sprint 1')).toBeInTheDocument();
      expect(screen.getByText('Backend')).toBeInTheDocument();
      expect(screen.getByText('Urgent')).toBeInTheDocument();
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('shows correct overflow count', () => {
      render(<TagBadgeGroup tags={mockTags} maxVisible={2} />);
      expect(screen.getByText('+3')).toBeInTheDocument();
    });

    it('defaults to showing 3 tags', () => {
      render(<TagBadgeGroup tags={mockTags} />);
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('does not show overflow when tags equal maxVisible', () => {
      render(<TagBadgeGroup tags={mockTags.slice(0, 3)} maxVisible={3} />);
      expect(screen.queryByText(/\+/)).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onTagClick when a tag is clicked', () => {
      const handleTagClick = jest.fn();
      render(<TagBadgeGroup tags={mockTags} maxVisible={3} onTagClick={handleTagClick} />);
      
      fireEvent.click(screen.getByText('Sprint 1').parentElement!);
      expect(handleTagClick).toHaveBeenCalledWith(1);
    });

    it('calls onOverflowClick when overflow button is clicked', () => {
      const handleOverflowClick = jest.fn();
      render(<TagBadgeGroup tags={mockTags} maxVisible={3} onOverflowClick={handleOverflowClick} />);
      
      fireEvent.click(screen.getByText('+2'));
      expect(handleOverflowClick).toHaveBeenCalled();
    });

    it('shows tooltip on overflow button', () => {
      render(<TagBadgeGroup tags={mockTags} maxVisible={3} />);
      const overflowButton = screen.getByText('+2');
      expect(overflowButton).toHaveAttribute('title', '2 more tags');
    });

    it('shows singular tooltip when one tag overflow', () => {
      render(<TagBadgeGroup tags={mockTags.slice(0, 4)} maxVisible={3} />);
      const overflowButton = screen.getByText('+1');
      expect(overflowButton).toHaveAttribute('title', '1 more tag');
    });
  });

  describe('styling', () => {
    it('applies correct gap between badges', () => {
      const { container } = render(<TagBadgeGroup tags={mockTags.slice(0, 2)} gap={8} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ gap: '8px' });
    });

    it('defaults to 6px gap', () => {
      const { container } = render(<TagBadgeGroup tags={mockTags.slice(0, 2)} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveStyle({ gap: '6px' });
    });
  });
});
