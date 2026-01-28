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

  // Limit output size to 512x512 for profile photos
  const maxSize = 512
  const outputSize = Math.min(pixelCrop.width, pixelCrop.height, maxSize)

  // Set canvas size
  canvas.width = outputSize
  canvas.height = outputSize

  // Draw the cropped image, scaling to output size
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize
  )

  // Convert to blob with timeout for iOS
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Image processing timed out'))
    }, 10000)

    try {
      canvas.toBlob(
        (blob) => {
          clearTimeout(timeout)
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Canvas toBlob failed'))
          }
        },
        'image/jpeg',
        0.85
      )
    } catch (err) {
      clearTimeout(timeout)
      reject(err)
    }
  })
}

// Helper to load image
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Image load timed out'))
    }, 10000)

    const image = new Image()
    // Don't set crossOrigin for data URLs - it can cause issues on iOS
    if (!url.startsWith('data:')) {
      image.crossOrigin = 'anonymous'
    }
    image.onload = () => {
      clearTimeout(timeout)
      resolve(image)
    }
    image.onerror = (error) => {
      clearTimeout(timeout)
      reject(error)
    }
    image.src = url
  })
}

export function ImageCropper({ imageSrc, onCropComplete, onCancel, saving }: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  const onCropChange = useCallback((location: Point) => {
    setCrop(location)
  }, [])

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom)
  }, [])

  const onCropAreaComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const onMediaLoaded = useCallback(() => {
    setImageLoaded(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) {
      setError('Please adjust the crop area first')
      return
    }

    setError(null)
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels)
      onCropComplete(croppedBlob)
    } catch (err) {
      console.error('Error cropping image:', err)
      setError('Failed to process image. Please try again.')
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
            onMediaLoaded={onMediaLoaded}
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

        {error && (
          <div className={styles.error}>{error}</div>
        )}

        <div className={styles.footer}>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={saving || !imageLoaded || !croppedAreaPixels}
          >
            Save Photo
          </Button>
        </div>
      </div>
    </div>
  )
}
