'use client'
import '@xyflow/react/dist/style.css'
import {
  BaseEdge, MarkerType, ReactFlow, getStraightPath, useInternalNode, type Edge, type EdgeProps, type InternalNode, type Node,
} from '@xyflow/react'
import { useMemo } from 'react'
import { useReducedMotion } from '@/components/providers/motion-pref'
import type { GroupMemberDTO, PaymentDTO } from '@/lib/api-types'
import { formatINR } from '@/lib/money'

/** Where the line from this node's centre towards `other`'s centre leaves this node's box (React Flow "floating edges"). */
function borderPoint(node: InternalNode, other: InternalNode) {
  const w = (node.measured.width ?? 0) / 2
  const h = (node.measured.height ?? 0) / 2
  const cx = node.internals.positionAbsolute.x + w
  const cy = node.internals.positionAbsolute.y + h
  const ox = other.internals.positionAbsolute.x + (other.measured.width ?? 0) / 2
  const oy = other.internals.positionAbsolute.y + (other.measured.height ?? 0) / 2
  if (!w || !h) return { x: cx, y: cy }
  const xx = (ox - cx) / (2 * w) - (oy - cy) / (2 * h)
  const yy = (ox - cx) / (2 * w) + (oy - cy) / (2 * h)
  const a = 1 / (Math.abs(xx) + Math.abs(yy) || 1)
  return { x: w * (a * xx + a * yy) + cx, y: h * (-a * xx + a * yy) + cy }
}

/** A straight arrow between the two boxes' edges, whatever the layout puts where. */
function FloatingEdge({ id, source, target, markerEnd, style, label, labelStyle, labelBgStyle, interactionWidth }: EdgeProps) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t) return null
  const a = borderPoint(s, t)
  const b = borderPoint(t, s)
  const [path, labelX, labelY] = getStraightPath({ sourceX: a.x, sourceY: a.y, targetX: b.x, targetY: b.y })
  return (
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} label={label} labelX={labelX} labelY={labelY}
      labelStyle={labelStyle} labelBgStyle={labelBgStyle} labelBgPadding={[6, 3]} labelBgBorderRadius={6} interactionWidth={interactionWidth} />
  )
}
const EDGE_TYPES = { floating: FloatingEdge }

/**
 * Spec §3.5 interactive settlement graph. A visual twin of the payments list above, which stays the accessible
 * source of truth: this canvas is aria-hidden with no focusable parts, and tapping an arrow opens that row's "Why?".
 */
export function SettlementGraph({ members, nets, payments, meId, onSelect }: {
  members: GroupMemberDTO[]; nets: { memberId: string; netPaise: number }[]; payments: PaymentDTO[]; meId: string; onSelect: (index: number) => void
}) {
  const reduced = useReducedMotion()
  const { nodes, edges } = useMemo(() => {
    const people = members.filter((m) => payments.some((p) => p.from === m.id || p.to === m.id))
    const r = 130
    const nodes: Node[] = people.map((m, i) => {
      const a = (2 * Math.PI * i) / people.length - Math.PI / 2
      const net = nets.find((n) => n.memberId === m.id)?.netPaise ?? 0
      return {
        id: m.id,
        position: { x: r * Math.cos(a), y: r * Math.sin(a) },
        data: { label: `${m.isMe ? 'You' : m.displayName}\n${net > 0 ? '+' : net < 0 ? '−' : ''}${formatINR(Math.abs(net))}` },
        draggable: false, connectable: false, selectable: false, focusable: false,
        style: {
          width: 110, whiteSpace: 'pre-line', fontSize: 12, borderRadius: 14,
          background: 'var(--card)', color: 'var(--foreground)',
          border: m.claimed ? `1px solid ${m.id === meId ? 'var(--primary)' : 'var(--border)'}` : '2px dashed var(--muted-foreground)',
        },
      }
    })
    const edges: Edge[] = payments.map((p, i) => {
      const mine = p.from === meId || p.to === meId
      const stroke = mine ? 'var(--primary)' : 'var(--muted-foreground)'
      return {
        id: `e${i}`, source: p.from, target: p.to, type: 'floating',
        label: formatINR(p.amountPaise),
        animated: !reduced,
        focusable: false,
        interactionWidth: 28,
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 },
        labelStyle: { fill: 'var(--foreground)', fontSize: 12 },
        labelBgStyle: { fill: 'var(--card)' },
        style: { stroke, strokeWidth: mine ? 2.5 : 1.5, cursor: 'pointer' },
      }
    })
    return { nodes, edges }
  }, [members, nets, payments, meId, reduced])

  return (
    <div aria-hidden="true" className="h-80 w-full overflow-hidden rounded-tile border bg-card [&_.react-flow\_\_handle]:opacity-0">
      <ReactFlow
        nodes={nodes} edges={edges} edgeTypes={EDGE_TYPES} fitView fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false} nodesFocusable={false} edgesFocusable={false} elementsSelectable={false}
        disableKeyboardA11y zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} panOnDrag={false} preventScrolling={false}
        onEdgeClick={(_, edge) => onSelect(Number(edge.id.slice(1)))}
      />
    </div>
  )
}
