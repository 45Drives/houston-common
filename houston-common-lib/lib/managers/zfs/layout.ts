import type { VDevType } from "./types";

/**
 * Chassis whose spinning and solid-state bays are laid out as two separate data
 * vdevs inside the same pool, keyed by the model name with hyphens normalised to
 * underscores. Every other chassis gets a single data vdev.
 */
const SPLIT_MEDIA_MODELS = new Set(["HomeLab_HL15_BEAST"]);

/** Below this a group cannot carry any redundancy of its own. */
const MIN_VDEV_WIDTH = 2;

/** The subset of drive properties the layout planner needs. */
export type LayoutDrive = {
  /** bytes */
  capacity: number;
  /** RPM for spinning media, 0 for SSD/NVMe */
  rotationRate: number;
};

export type PlannedVDev<T> = {
  type: VDevType;
  members: T[];
};

export type PoolLayout<T> = {
  /** Data vdevs, in the order they should be passed to `zpool create`. */
  vdevs: PlannedVDev<T>[];
  /** Drives that cannot form a vdev but are big enough to replace a data drive. */
  spares: T[];
  /** Drives left out of the pool entirely (too small to spare for anything). */
  unused: T[];
};

export function normalizeChassisModel(model: string | undefined | null): string {
  return (model ?? "").trim().replace(/-/g, "_");
}

/** True when this chassis mixes media types that should not share a vdev. */
export function usesSplitMediaVdevs(model: string | undefined | null): boolean {
  return SPLIT_MEDIA_MODELS.has(normalizeChassisModel(model));
}

/** Best-practice redundancy for a single vdev of `count` data disks. */
export function vdevTypeForDiskCount(count: number): VDevType {
  if (count >= 5) return "raidz2";
  if (count >= 3) return "raidz1";
  if (count === 2) return "mirror";
  return "disk";
}

/** Simultaneous disk failures a single vdev of this shape can survive. */
export function parityForVdev(type: VDevType | string, diskCount: number): number {
  if (type === "mirror") return Math.max(0, diskCount - 1);
  if (type.startsWith("raidz")) {
    return Math.min(parseInt(type.slice(5), 10) || 1, Math.max(0, diskCount - 1));
  }
  return 0;
}

/**
 * Choose the vdev layout for a pool from the drives that are actually present,
 * so a half-populated chassis still gets a sane, redundant pool.
 */
export function planPoolLayout<T>(
  drives: T[],
  getDrive: (item: T) => LayoutDrive,
  options: { model?: string | null } = {}
): PoolLayout<T> {
  if (drives.length === 0) {
    return { vdevs: [], spares: [], unused: [] };
  }

  const spinning = drives.filter((d) => getDrive(d).rotationRate > 0);
  const solidState = drives.filter((d) => getDrive(d).rotationRate <= 0);

  const candidates =
    usesSplitMediaVdevs(options.model) && spinning.length > 0 && solidState.length > 0
      ? [spinning, solidState]
      : [drives];

  let groups = candidates.filter((g) => g.length >= MIN_VDEV_WIDTH);
  let leftovers = candidates.filter((g) => g.length < MIN_VDEV_WIDTH).flat();

  // Nothing wide enough to stand on its own: pool everything into one vdev
  // rather than emitting a pool with no data devices at all.
  if (groups.length === 0) {
    groups = [drives];
    leftovers = [];
  }

  const vdevs = groups.map((members) => ({
    type: vdevTypeForDiskCount(members.length),
    members,
  }));

  // A spare is only useful if it can stand in for the drive that fails.
  const smallestDataCapacity = Math.min(
    ...vdevs.flatMap((v) => v.members).map((d) => getDrive(d).capacity)
  );

  return {
    vdevs,
    spares: leftovers.filter((d) => getDrive(d).capacity >= smallestDataCapacity),
    unused: leftovers.filter((d) => getDrive(d).capacity < smallestDataCapacity),
  };
}

/** Simultaneous failures the whole pool is guaranteed to survive. */
export function faultToleranceForLayout<T>(layout: PoolLayout<T>): number {
  if (layout.vdevs.length === 0) return 0;
  return Math.min(
    ...layout.vdevs.map((v) => parityForVdev(v.type, v.members.length))
  );
}

/** Post-parity capacity in bytes, sized per vdev by its smallest member. */
export function usableCapacityForLayout<T>(
  layout: PoolLayout<T>,
  getDrive: (item: T) => LayoutDrive
): number {
  return layout.vdevs.reduce((total, vdev) => {
    if (vdev.members.length === 0) return total;
    const parity = parityForVdev(vdev.type, vdev.members.length);
    const smallest = Math.min(...vdev.members.map((d) => getDrive(d).capacity));
    return total + Math.max(0, vdev.members.length - parity) * smallest;
  }, 0);
}
