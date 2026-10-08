import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Text } from '@react-three/drei'
import * as THREE from 'three'
import { api } from './api'
import ItemCard from './ItemCard.jsx'
import RoleHub from './RoleHub.jsx'

/** The glowing loop at the centre of the courtyard. */
function Loop() {
  const knot = useRef()
  useFrame((_, dt) => {
    knot.current.rotation.y += dt * 0.35
    knot.current.rotation.x += dt * 0.12
  })
  return (
    <group position={[0, 1.7, 0]}>
      <mesh ref={knot}>
        <torusKnotGeometry args={[0.8, 0.2, 180, 24, 2, 3]} />
        <meshStandardMaterial color="#5fd0b3" emissive="#5fd0b3" emissiveIntensity={0.75} metalness={0.5} roughness={0.25} />
      </mesh>
      <pointLight color="#5fd0b3" intensity={6} distance={10} />
    </group>
  )
}

function Floor() {
  return (
    <group position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <circleGeometry args={[10, 72]} />
        <meshStandardMaterial color="#0f2234" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[9.8, 10, 72]} />
        <meshBasicMaterial color="#5fd0b3" transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[6.9, 6.95, 72]} />
        <meshBasicMaterial color="#25405a" />
      </mesh>
    </group>
  )
}

/** Ease the camera to a new spot whenever the role changes, then hand control back to the user. */
function CameraRig({ role }) {
  const { camera } = useThree()
  const t = useRef(1)
  const goal = useMemo(() => (role ? new THREE.Vector3(0, 6.5, 14) : new THREE.Vector3(0, 4.5, 11.5)), [role])
  useEffect(() => { t.current = 0 }, [role])
  useFrame((_, dt) => {
    if (t.current < 1) {
      t.current = Math.min(1, t.current + dt * 0.7)
      camera.position.lerp(goal, 0.06)
    }
  })
  return null
}

function ItemRing({ items, onSelect }) {
  const group = useRef()
  const paused = useRef(false)
  useFrame((_, dt) => {
    if (!paused.current) group.current.rotation.y += dt * 0.07
  })
  const PER_RING = 8
  return (
    <group ref={group}>
      {items.map((it, i) => {
        const ring = Math.floor(i / PER_RING)
        const inRing = Math.min(PER_RING, items.length - ring * PER_RING)
        const a = ((i % PER_RING) / inRing) * Math.PI * 2
        const R = 6.9
        return (
          <ItemCard
            key={it.id}
            item={it}
            position={[Math.sin(a) * R, 1.5 + ring * 2.1, Math.cos(a) * R]}
            onSelect={onSelect}
            onHover={(h) => { paused.current = h }}
          />
        )
      })}
    </group>
  )
}

export default function Scene3D({ role, refreshKey, onPickRole, onSelectItem }) {
  const [items, setItems] = useState([])
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () =>
      api.items()
        .then((d) => { if (alive) { setItems(d); setOffline(false) } })
        .catch(() => { if (alive) setOffline(true) })
    load()
    const id = setInterval(load, 8000)
    return () => { alive = false; clearInterval(id) }
  }, [refreshKey])

  // Repairers only need to see things that might be fixable.
  const visible = useMemo(
    () => (role === 'repairer' ? items.filter((i) => i.safety_state !== 'reuse_ready') : items),
    [items, role]
  )

  return (
    <>
      <Canvas camera={{ position: [0, 4.5, 11.5], fov: 55 }} dpr={[1, 2]}>
        <color attach="background" args={['#0d1b2a']} />
        <fog attach="fog" args={['#0d1b2a', 20, 46]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[6, 10, 6]} intensity={0.9} />
        <Stars radius={60} depth={30} count={1800} factor={3} fade speed={0.4} />
        <Suspense fallback={null}>
          <Floor />
          <Loop />
          {!role && <RoleHub onPick={onPickRole} />}
          {role && <ItemRing items={visible} onSelect={onSelectItem} />}
          {role && visible.length === 0 && (
            <Text position={[0, 3.6, 0]} fontSize={0.3} color="#8aa0b2" anchorX="center">
              {offline ? 'Cannot reach the backend on port 8000' : 'Nothing listed yet. Sellers can post the first item.'}
            </Text>
          )}
        </Suspense>
        <CameraRig role={role} />
        <OrbitControls makeDefault target={[0, 1.8, 0]} enablePan={false} minDistance={5} maxDistance={24} maxPolarAngle={Math.PI / 2.08} />
      </Canvas>
      {offline && role && visible.length > 0 && <div className="toast">Backend offline. Showing the last loaded items.</div>}
    </>
  )
}
