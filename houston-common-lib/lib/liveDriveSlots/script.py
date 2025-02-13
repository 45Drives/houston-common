#!/usr/bin/env python3

import pyudev
import json
import re


def get_smart_info(device: pyudev.Device) -> dict:
    return None


def get_drive(device: pyudev.Device) -> dict:
    drive = {}
    drive["path"] = device.device_node
    drive["pathByPath"] = next(
        (link for link in device.device_links if link.startswith("/dev/disk/by-path/")),
        None,
    )
    drive["capacity"] = int(device.attributes.get("size", 0)) * 512
    drive["model"] = device.get("ID_MODEL", "unknown")
    drive["serial"] = device.get("ID_SERIAL_SHORT", device.get("ID_SERIAL", "unknown"))
    drive["firmwareVersion"] = device.get("ID_REVISION", "unknown")
    drive["rotationRate"] = int(device.get("ID_ATA_ROTATION_RATE_RPM", 0))
    drive["partitionCount"] = len(
        [child for child in device.children if child.device_type == "partition"]
    )
    drive["smartInfo"] = get_smart_info(device)
    return drive


def handle_remove(device: pyudev.Device, slot: dict):
    slot["drive"] = None
    message = {"type": "change", "slot": slot}
    print(json.dumps(message, indent=None), flush=True)


def handle_add_or_change(device: pyudev.Device, slot: dict):
    slot["drive"] = get_drive(device)
    message = {"type": "change", "slot": slot}
    print(json.dumps(message, indent=None), flush=True)


def monitor_changes(udev_ctx: pyudev.Context):
    udev_monitor = pyudev.Monitor.from_netlink(udev_ctx)

    udev_monitor.filter_by("block", "disk")

    for device in iter(udev_monitor.poll, None):
        slot = {}

        if "SLOT_NAME" in device:
            slot["slotId"] = device["SLOT_NAME"]
        elif "ID_VDEV" in device:
            slot["slotId"] = device["ID_VDEV"]
        else:
            continue

        if device.action == "remove":
            handle_remove(device, slot)
        elif device.action in ["add", "change"]:
            handle_add_or_change(device, slot)


def report_initial(udev_ctx: pyudev.Context):
    slotMap = {}

    with open("/etc/vdev_id.conf", "r") as vdev_id:
        for line in vdev_id:
            if not line.startswith("alias"):
                continue
            [_, slotId, *_] = re.split(r"\s+", line)
            slotMap[slotId] = None

    for device in udev_ctx.list_devices(subsystem="block", DEVTYPE="disk"):
        slotId = None
        if "SLOT_NAME" in device:
            slotId = device["SLOT_NAME"]
        elif "ID_VDEV" in device:
            slotId = device["ID_VDEV"]
        else:
            continue

        slotMap[slotId] = get_drive(device)

    message = {
        "type": "reportAll",
        "slots": list(map(lambda x: {"slotId": x[0], "drive": x[1]}, slotMap.items())),
    }
    print(json.dumps(message, indent=None), flush=True)


def main():
    udev_ctx = pyudev.Context()

    report_initial(udev_ctx)

    monitor_changes(udev_ctx)


if __name__ == "__main__":
    main()
