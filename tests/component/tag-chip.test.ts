// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import TagChip from '../../src/client/components/TagChip.vue';

describe('TagChip', () => {
  it('renders the tag name and applies the tag color', () => {
    render(TagChip, { props: { tag: { id: 1, name: 'VIP', color: '#3B82F6' } } });

    const chip = screen.getByText('VIP');
    expect(chip.textContent).toContain('VIP');
    expect(chip.style.backgroundColor).toBe('rgb(59, 130, 246)');
  });

  it('emits a remove event carrying the tag id from its close affordance when removable', async () => {
    const { emitted } = render(TagChip, { props: { tag: { id: 7, name: 'Q3', color: '#22C55E' }, removable: true } });

    await fireEvent.click(screen.getByRole('button', { name: /remove q3/i }));

    expect(emitted().remove).toEqual([[7]]);
  });

  it('renders no close affordance when not removable', () => {
    render(TagChip, { props: { tag: { id: 1, name: 'VIP', color: '#3B82F6' } } });

    expect(screen.queryByRole('button')).toBeNull();
  });
});
