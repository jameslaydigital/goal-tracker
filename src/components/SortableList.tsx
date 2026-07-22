import { createContext, useContext, type ReactNode } from 'react'
import {
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type DragContextValue = {
  listeners: DraggableSyntheticListeners
  attributes: DraggableAttributes
}

const DragContext = createContext<DragContextValue | null>(null)

export function SortableGroup({
  items,
  onReorder,
  children,
}: {
  items: { id: string }[]
  onReorder: (oldIndex: number, newIndex: number) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(i => i.id === active.id)
    const newIndex = items.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(oldIndex, newIndex)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

export function SortableItem({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-50' : ''}>
      <DragContext.Provider value={{ listeners, attributes }}>
        {children}
      </DragContext.Provider>
    </div>
  )
}

export function DragHandle({ className = '' }: { className?: string }) {
  const ctx = useContext(DragContext)
  if (!ctx) return null
  return (
    <button
      {...(ctx.listeners || {})}
      {...ctx.attributes}
      className={`cursor-grab active:cursor-grabbing touch-none ${className}`}
      type="button"
      aria-label="Drag to reorder"
    >
      ⠿
    </button>
  )
}
