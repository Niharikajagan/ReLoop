import React, { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Float, Text, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { ROLES } from './utils'

function RoleButton({ role, position, onPick }) {
  const body = useRef()
  const ring = useRef()
  const [hovered, setHovered] = useState(false)
  useCursor(hovered)

  useFrame((_, dt) => {
    ring.current.rotation.z += dt * 0.5
    const target = hovered ? 1.15 : 1
    body.current.scale.setScalar(THREE.MathUtils.lerp(body.current.scale.x, target, 0.15))
  })

  return (
    <group position={position}>
      <Float speed={1.5} floatIntensity={0.35} rotationIntensity={0}>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
          <ringGeometry args={[0.78, 0.88, 6]} />
          <meshBasicMaterial color={role.color} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
        <mesh
          ref={body}
          onClick={(e) => { e.stopPropagation(); onPick(role.key) }}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
          onPointerOut={() => setHovered(false)}
        >
          <cylinderGeometry args={[0.65, 0.7, 0.2, 6]} />
          <meshStandardMaterial color={role.color} emissive={role.color} emissiveIntensity={hovered ? 0.9 : 0.35} roughness={0.35} metalness={0.5} />
        </mesh>
        <Text position={[0, 0.62, 0]} fontSize={0.3} color="#e8efe6" anchorX="center" anchorY="middle">
          {role.label}
        </Text>
        <Text position={[0, -0.55, 0.3]} fontSize={0.14} color="#8aa0b2" anchorX="center" anchorY="middle">
          {role.hint}
        </Text>
      </Float>
    </group>
  )
}

export default function RoleHub({ onPick }) {
  const R = 4.6
  return (
    <group>
      <Text position={[0, 4.3, 0]} fontSize={0.9} color="#e8efe6" anchorX="center" anchorY="middle" letterSpacing={-0.02}>
        ReLoop
      </Text>
      <Text position={[0, 3.55, 0]} fontSize={0.2} color="#8aa0b2" anchorX="center" anchorY="middle">
        Give things a second loop. Choose who you are.
      </Text>
      {ROLES.map((r, i) => {
        const a = (i / ROLES.length) * Math.PI * 2 + Math.PI / 4
        return <RoleButton key={r.key} role={r} position={[Math.sin(a) * R, 0.3, Math.cos(a) * R]} onPick={onPick} />
      })}
    </group>
  )
}
