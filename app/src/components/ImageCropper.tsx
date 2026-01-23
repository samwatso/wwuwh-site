/**
 * ImageCropper Component
 *
 * Modal for cropping and adjusting profile photos before upload.
 * Uses react-easy-crop for the cropping functionality.
 */

import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import { Button } from '@/components'
import styles from './ImageCropper.module.css'

export interface ImageCropperProps {
  imageSrc: string
  onCropComplete: (croppedBlob: Blob) => void
  onCancel: () => void
  saving?: boolean
}

// Helper function to create a cropped image
async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('No 2d context')
  }

  // Set canvas size to the cropped area
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('Canvas toBlob failed'))
        }
      },
      'image/jpeg',
      0.9
    )
  })
}

// Helper to load image
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.src = url
  })
}

export function ImageCropper({ imageSrc, onCropComplete, onCancel, saving }: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropChange = useCallback((location: Point) => {
    setCrop(location)
  }, [])

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom)
  }, [])

  const onCropAreaComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      onCropComplete(croppedBlob)
    } catch (err) {
      console.error('Error cropping image:', err)
    }
  }, [imageSrc, croppedAreaPixels, onCropComplete])

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3>Adjust Photo</h3>
          <button className={styles.closeBtn} onClick={onCancel} disabled={saving}>
            &times;
          </button>
        </div>

        <div className={styles.cropContainer}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaComplete}
          />
        </div>

        <div className={styles.controls}>
          <label className={styles.zoomLabel}>Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className={styles.zoomSlider}
          />
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={saving}>
            Save Photo
          </Button>
        </div>
      </div>
    </div>
  )
}
