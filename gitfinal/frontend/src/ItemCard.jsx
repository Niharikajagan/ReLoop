import React, { Component, Suspense, useMemo, useState } from 'react'
import { useLoader } from '@react-three/fiber'
import { Billboard, Float, RoundedBox, Text, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { COLORS, LABELS, fmtDue } from './utils'
import { assetUrl } from './api'

const PHOTO = 1.1

function PhotoPlaceholder({ label }) {
  return (
    <group position={[1.05, 0, 0.07]}>
      <mesh>
        <planeGeometry args={[PHOTO, PHOTO]} />
        <meshBasicMaterial color="#0d1b2a" />
      </mesh>
      <Text fontSize={0.1} color="#5d7589" anchorX="center" anchorY="middle">{label}</Text>
    </group>
  )
}

/** Shows the seller's photo, cropped to fill the square like CSS object-fit: cover. */
function Photo({ url }) {
  const tex = useLoader(THREE.TextureLoader, url)
  const map = useMemo(() => {
    const t = tex
    t.colorSpace = THREE.SRGBColorSpace
    const aspect = t.image.width / t.image.height
    if (aspect > 1) { t.repeat.set(1 / aspect, 1); t.offset.set((1 - 1 / aspect) / 2, 0) }
    else { t.repeat.set(1, aspect); t.offset.set(0, (1 - aspect) / 2) }
    return t
  }, [tex])
  return (
    <mesh position={[1.05, 0, 0.07]}>
      <planeGeometry args={[PHOTO, PHOTO]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  )
}

class PhotoBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <PhotoPlaceholder label="Photo unavailable" /> : this.props.children }
}

/** One floating card per item. Billboard keeps it facing the camera while the ring turns. */
export default function ItemCard({ item, position, onSelect, onHover }) {
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)
  const color = COLORS[item.safety_state] || COLORS.needs_inspection
  const issue = item.known_issues && item.known_issues !== 'UNKNOWN' ? item.known_issues : 'No issues reported'

  const over = (e) => { e.stopPropagation(); setHovered(true); onHover(true) }
  const out = () => { setHovered(false); onHover(false) }

  return (
    <group position={position}>
      <Billboard>
        <Float speed={1.4} floatIntensity={0.5} rotationIntensity={0}>
          <group
            scale={hovered ? 1.08 : 1}
            onPointerOver={over}
            onPointerOut={out}
            onClick={(e) => { e.stopPropagation(); onSelect(item) }}
          >
            <RoundedBox args={[3.3, 1.5, 0.1]} radius={0.09} smoothness={4}>
              <meshStandardMaterial color="#12263a" emissive={color} emissiveIntensity={hovered ? 0.35 : 0.1} roughness={0.5} metalness={0.3} />
            </RoundedBox>
            <mesh position={[-1.58, 0, 0.06]}>
              <boxGeometry args={[0.07, 1.2, 0.02]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
            </mesh>

            {item.image_url ? (
              <PhotoBoundary>
                <Suspense fallback={<PhotoPlaceholder label="Loading" />}>
                  <Photo url={assetUrl(item.image_url)} />
                </Suspense>
              </PhotoBoundary>
            ) : (
              <PhotoPlaceholder label="No photo" />
            )}

            <Text position={[-1.43, 0.38, 0.07]} fontSize={0.2} color="#e8efe6" anchorX="left" anchorY="middle" maxWidth={1.9}>
              {(item.title || 'Item').slice(0, 16)}
            </Text>
            <Text position={[-1.43, 0.05, 0.07]} fontSize={0.12} color="#8aa0b2" anchorX="left" anchorY="middle" maxWidth={1.9}>
              {issue.slice(0, 30)}
            </Text>
            <Text position={[-1.43, -0.3, 0.07]} fontSize={0.13} color={color} anchorX="left" anchorY="middle">
              {LABELS[item.safety_state] || 'Needs a look'}
            </Text>
            <Text position={[-1.43, -0.55, 0.07]} fontSize={0.1} color="#8aa0b2" anchorX="left" anchorY="middle">
              {'Due ' + fmtDue(item.deadline_ts)}
            </Text>
          </group>
        </Float>
      </Billboard>
    </group>
  )
}
