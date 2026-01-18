import { useState, useCallback } from 'react';
import { Note, NoteColor } from '@/types/note';
import { arrayMove } from '@dnd-kit/sortable';

const generateId = () => Math.random().toString(36).substring(2, 15);

const sampleNotes: Note[] = [
  {
    id: generateId(),
    title: '关于 AI',
    content: 'AI 为核心的组织，从组织角度，如果未来决策是 AI 来做，人是 AI 的执行层，会是什么变化',
    color: 'white',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: true,
  },
  {
    id: generateId(),
    content: '沉浸于过时技术，而忽视了 AI 的巨大发展',
    color: 'white',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
  {
    id: generateId(),
    title: '思考',
    content: '这类客户对我们来说，可能是一个门槛低的起步。这也是我们一个特点，最高质量模型的低门槛起步',
    color: 'yellow',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
  {
    id: generateId(),
    content: '跨行业的人，容易对新行业的过时技术着迷',
    color: 'white',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
  {
    id: generateId(),
    title: 'Manus 模式',
    content: '一堆东西，乱搞，看上去很丰富，总能命中',
    color: 'white',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
  {
    id: generateId(),
    content: '被伤害过的人，会一直想着找回来',
    color: 'white',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
  {
    id: generateId(),
    content: '很多人话多，不愿意安静，是因为年纪大了',
    color: 'white',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
  {
    id: generateId(),
    title: '春江水暖鸭先知',
    content: '我很喜欢"春江水暖鸭先知"这句话，你要培养对产品的敏锐洞察和对行业趋势的判断，不下水是不可能的，你要天天浸泡，日日夜夜思索。',
    color: 'green',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
  {
    id: generateId(),
    content: '加速运算的思想无非：预处理，分而治之，硬件提升——元宁',
    color: 'blue',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
  {
    id: generateId(),
    title: '视角转换',
    content: '如果一直盯着一个人的缺点来看，你会发现这个人千疮百孔，无一是处。换个视角，想想"他能做些什么，他能改变些什么"，情况就不一样了。',
    color: 'white',
    createdAt: new Date(),
    updatedAt: new Date(),
    pinned: false,
  },
];

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(sampleNotes);

  const addNote = useCallback((content: string, title?: string, color: NoteColor = 'white') => {
    const newNote: Note = {
      id: generateId(),
      title,
      content,
      color,
      createdAt: new Date(),
      updatedAt: new Date(),
      pinned: false,
    };
    setNotes(prev => [newNote, ...prev]);
    return newNote;
  }, []);

  const updateNote = useCallback((id: string, updates: Partial<Omit<Note, 'id' | 'createdAt'>>) => {
    setNotes(prev => prev.map(note => 
      note.id === id 
        ? { ...note, ...updates, updatedAt: new Date() }
        : note
    ));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(note => note.id !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setNotes(prev => prev.map(note =>
      note.id === id
        ? { ...note, pinned: !note.pinned }
        : note
    ));
  }, []);

  const reorderNotes = useCallback((activeId: string, overId: string, isPinned: boolean) => {
    setNotes(prev => {
      const pinnedNotes = prev.filter(n => n.pinned);
      const unpinnedNotes = prev.filter(n => !n.pinned);
      
      const targetArray = isPinned ? pinnedNotes : unpinnedNotes;
      const oldIndex = targetArray.findIndex(n => n.id === activeId);
      const newIndex = targetArray.findIndex(n => n.id === overId);
      
      if (oldIndex === -1 || newIndex === -1) return prev;
      
      const reordered = arrayMove(targetArray, oldIndex, newIndex);
      
      if (isPinned) {
        return [...reordered, ...unpinnedNotes];
      } else {
        return [...pinnedNotes, ...reordered];
      }
    });
  }, []);

  const searchNotes = useCallback((query: string) => {
    if (!query.trim()) return notes;
    const lowerQuery = query.toLowerCase();
    return notes.filter(note => 
      note.content.toLowerCase().includes(lowerQuery) ||
      note.title?.toLowerCase().includes(lowerQuery)
    );
  }, [notes]);

  const pinnedNotes = notes.filter(n => n.pinned);
  const unpinnedNotes = notes.filter(n => !n.pinned);

  return {
    notes,
    pinnedNotes,
    unpinnedNotes,
    addNote,
    updateNote,
    deleteNote,
    togglePin,
    reorderNotes,
    searchNotes,
  };
}
