import { useEffect } from 'react';
import {
  EditorContent,
  useEditor,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Code,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Sigma,
  Underline as UnderlineIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * In-editor image rendered with a per-image delete (×) button, so each image
 * can be removed individually. The button lives only in the editor DOM —
 * getHTML() still serializes a plain <img>, so save/upload logic is unaffected.
 */
const ImageNodeView = ({ node, getPos, editor }: NodeViewProps) => {
  const { src, alt } = node.attrs as { src: string; alt?: string };
  const remove = (): void => {
    if (typeof getPos !== 'function') return;
    const pos = getPos();
    if (pos == null) return;
    editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  };
  return (
    <NodeViewWrapper className="relative my-2 inline-block" contentEditable={false} draggable={false}>
      <img src={src} alt={alt ?? ''} className="max-w-full rounded border border-border" />
      {editor.isEditable && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={remove}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition-colors hover:bg-danger"
          title="Remove this image"
          aria-label="Remove this image"
        >
          <X size={14} />
        </button>
      )}
    </NodeViewWrapper>
  );
};

const ImageWithControls = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
  /** Optional id so multiple editors on the same page get unique aria. */
  id?: string;
}

/**
 * TipTap-backed rich text editor. Toolbar above, content below. Output is HTML
 * (TipTap's default). The math button inserts a `$…$` placeholder; the actual
 * KaTeX rendering happens at display time (read-only QuestionDetail view), not
 * inside the editor — keeps the editor light.
 */
export const RichTextEditor = ({
  value,
  onChange,
  placeholder = 'Type or paste content…',
  minHeight = 120,
  disabled,
  id,
}: Props) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder }),
      // Without an image node, StarterKit silently strips <img> on setContent —
      // which would drop teacher-uploaded/snipped question images the moment
      // the editor loaded that HTML. Keep images as first-class nodes.
      // allowBase64 MUST be true: deferred snips/uploads are embedded as `data:`
      // URLs until Save, and base64 srcs are dropped on parse without it (the
      // image would vanish when switching into Write Text). The custom node view
      // adds a per-image × delete button.
      ImageWithControls.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: 'max-w-full rounded border border-border my-2' },
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class:
          'tiptap-content prose-sm max-w-none focus:outline-none text-text leading-6 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_p:first-child]:mt-0 [&_p:empty]:before:content-[attr(data-placeholder)] [&_p:empty]:before:text-text-faint',
        spellcheck: 'true',
      },
    },
  });

  // External value resync (e.g. server prefill or undo).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (current !== value) editor.commands.setContent(value, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  const insertMath = (): void => {
    editor.chain().focus().insertContent('$  $').run();
    // Position cursor between the two $ — best-effort, TipTap will land near-by.
    const { from } = editor.state.selection;
    editor.commands.setTextSelection(from - 2);
  };

  const Btn = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded text-text-muted hover:bg-hover hover:text-text disabled:cursor-not-allowed disabled:opacity-50',
        active && 'bg-primary-soft text-primary',
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="overflow-hidden rounded border border-border bg-surface focus-within:border-primary">
      <div className="flex items-center gap-0.5 border-b border-border-soft bg-subtle px-1.5 py-1">
        <Btn
          title="Bold (Cmd+B)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </Btn>
        <Btn
          title="Italic (Cmd+I)"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </Btn>
        <Btn
          title="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <UnderlineIcon size={14} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Btn
          title="Bulleted list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </Btn>
        <Btn
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </Btn>
        <Btn
          title="Quote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} />
        </Btn>
        <Btn
          title="Inline code"
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={14} />
        </Btn>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Btn
          title="Insert link"
          active={editor.isActive('link')}
          onClick={() => {
            const url = window.prompt('URL');
            if (url) editor.chain().focus().setLink({ href: url }).run();
            else editor.chain().focus().unsetLink().run();
          }}
        >
          <LinkIcon size={14} />
        </Btn>
        <Btn title="Insert math ($…$ KaTeX)" onClick={insertMath}>
          <Sigma size={14} />
        </Btn>
      </div>
      <div
        id={id}
        className="px-3 py-2 text-sm"
        style={{ minHeight }}
        onClick={() => editor.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

/**
 * Read-only inline renderer. Converts `$…$` segments into KaTeX HTML so the
 * Question detail / review screens preview math nicely without bloating the
 * editor with a live KaTeX node.
 */
export { renderWithMath } from './render-with-math';
