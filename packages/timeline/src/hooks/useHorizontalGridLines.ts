import { useEffect, useState } from "react"
import * as THREE from "three"

import { useTimeline } from "./useTimeline"

export const useHorizontalGridLines = () => {

  const contentWidth = useTimeline(s => s.contentWidth)
  const getVerticalCellPosition = useTimeline(s => s.getVerticalCellPosition)

  const tracks = useTimeline(s => s.tracks)

  const [gridlines, setGridLines] = useState([] as THREE.BufferGeometry<THREE.NormalBufferAttributes>[]);

  useEffect(() => {

    const thisLines = [] as THREE.BufferGeometry<THREE.NormalBufferAttributes>[];

    for (let i = 0; i <= tracks.length; i++) {
      const horizontalLinePoints = [
        new THREE.Vector3(0, -getVerticalCellPosition(0, i), 0),
        new THREE.Vector3(contentWidth, -getVerticalCellPosition(0, i), 0)
      ];
      const horizontalLineGeometry = new THREE.BufferGeometry().setFromPoints(horizontalLinePoints);

      thisLines.push(horizontalLineGeometry);
    }

    setGridLines(thisLines);
  }, [
    contentWidth,
    JSON.stringify(tracks.map((t: any) => `${t.visible}_${t.height}`)),
]);

  return gridlines;
};