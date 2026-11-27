import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Modal } from '../ui/Modal';

afterEach(cleanup);

function renderConfirm(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<ConfirmDialog open title="Delete thing" message="Really?" confirmLabel="Delete" tone="danger" onConfirm={onConfirm} onCancel={onCancel} {...props} />);
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('renders an accessible dialog with the message', () => {
    renderConfirm();
    const dialog = screen.getByRole('dialog', { name: 'Delete thing' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Really?');
  });

  it('confirms and cancels', async () => {
    const { onConfirm, onCancel } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape and on a backdrop click', () => {
    const { onCancel } = renderConfirm();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('starts with focus on the safe (cancel) action', () => {
    renderConfirm();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('keeps focus inside the dialog when tabbing', () => {
    renderConfirm();
    const first = screen.getByRole('button', { name: 'Close dialog' });
    const last = screen.getByRole('button', { name: 'Delete' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('shows an error inline when the action fails and stays open', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Nope, that failed'));
    renderConfirm({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope, that failed');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  describe('typed confirmation', () => {
    it('requires the exact text before enabling the confirm button', () => {
      const { onConfirm } = renderConfirm({ requireText: 'acme-corp', confirmLabel: 'Delete company' });
      const button = screen.getByRole('button', { name: 'Delete company' });
      const input = screen.getByLabelText(/Type/);
      expect(input).toHaveFocus();
      expect(button).toBeDisabled();

      fireEvent.change(input, { target: { value: 'acme' } });
      expect(button).toBeDisabled();
      fireEvent.change(input, { target: { value: 'ACME-CORP' } });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onConfirm).not.toHaveBeenCalled();

      fireEvent.change(input, { target: { value: 'acme-corp' } });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('submits with Enter only when the text matches', async () => {
      const { onConfirm } = renderConfirm({ requireText: 'acme' });
      const input = screen.getByLabelText(/Type/);
      fireEvent.submit(input.closest('form')!);
      expect(onConfirm).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: 'acme' } });
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    it('clears the typed text when reopened', () => {
      const { rerender } = render(<ConfirmDialog open title="t" message="m" requireText="x1" onConfirm={() => undefined} onCancel={() => undefined} />);
      fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'x1' } });
      rerender(<ConfirmDialog open={false} title="t" message="m" requireText="x1" onConfirm={() => undefined} onCancel={() => undefined} />);
      rerender(<ConfirmDialog open title="t" message="m" requireText="x1" onConfirm={() => undefined} onCancel={() => undefined} />);
      expect(screen.getByLabelText(/Type/)).toHaveValue('');
    });
  });
});

describe('Modal', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Hello">
          <input aria-label="Name" />
        </Modal>
      </>
    );
  }

  it('moves focus into the dialog and restores it to the opener on close', async () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByLabelText('Name')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('ignores Escape when not dismissable', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Busy" dismissable={false} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
