#!/usr/bin/env python3

from functools import partial
import pyudev, json, re, subprocess, argparse

AUTO_REFRESH_TIME = 30


def get_smart_info(device: pyudev.Device) -> dict:
    smart_info = {}
    child = subprocess.Popen(
        ["smartctl", "-a", device.device_node, "--json"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
    )
    stdout, stderr = child.communicate(timeout=5)
    ret = child.wait()
    if ret & 2:  # failed to open
        return None
    smart_json = json.loads(stdout)

    smart_info["modelFamily"] = (
        smart_json["model_family"] if "model_family" in smart_json else "?"
    )
    if "temperature" in smart_json and "current" in smart_json["temperature"]:
        smart_info["temperature"] = smart_json["temperature"]["current"]
    if "power_on_time" in smart_json and "hours" in smart_json["power_on_time"]:
        smart_info["powerOnHours"] = smart_json["power_on_time"]["hours"]
    if "power_cycle_count" in smart_json:
        smart_info["powerCycleCount"] = smart_json["power_cycle_count"]
    if "ata_smart_attributes" in smart_json:
        table = smart_json["ata_smart_attributes"]["table"]

        def get_attr(name, fallback) -> str:
            return next(
                iter([attr["raw"]["string"] for attr in table if attr["name"] == name]),
                fallback,
            )

        smart_info["startStopCount"] = int(get_attr("Start_Stop_Count", -1))
        if "powerOnHours" not in smart_info:
            smart_info["powerOnHours"] = int(get_attr("Power_On_Hours", -1))
        if "powerCycleCount" not in smart_info:
            smart_info["powerCycleCount"] = int(get_attr("Power_Cycle_Count", -1))
        if "temperature" not in smart_info:
            smart_info["temperature"] = int(get_attr("Temperature_Celsius", -1))
    smart_info["health"] = (
        "OK"
        if "smart_status" in smart_json.keys() and smart_json["smart_status"]["passed"]
        else "POOR"
    )
    smart_info["freshness"] = get_freshness(smart_info) 
    return smart_info


def get_freshness(smart_info: dict):
    return "NEW"


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


def monitor_changes(udev_ctx: pyudev.Context, args):
    udev_monitor = pyudev.Monitor.from_netlink(udev_ctx)

    udev_monitor.filter_by("block", "disk")

    while True:
        for device in iter(partial(udev_monitor.poll, AUTO_REFRESH_TIME), None):
            if device.device_path.startswith("/devices/virtual"):
                continue
            slot = {}

            if "SLOT_NAME" in device:
                slot["slotId"] = device["SLOT_NAME"]
            elif "ID_VDEV" in device:
                slot["slotId"] = device["ID_VDEV"]
            elif args.include_non_aliased:
                slot["slotId"] = "unknown"
            else:
                continue

            if device.action == "remove":
                handle_remove(device, slot)
            elif device.action in ["add", "change"]:
                handle_add_or_change(device, slot)
        report_initial(udev_ctx, args)


def get_slots(udev_ctx: pyudev.Context, args):
    slotMap = {}
    nonAliased = []

    with open("/etc/vdev_id.conf", "r") as vdev_id:
        for line in vdev_id:
            if not line.startswith("alias"):
                continue
            [_, slotId, *_] = re.split(r"\s+", line)
            slotMap[slotId] = None

    for device in udev_ctx.list_devices(subsystem="block", DEVTYPE="disk"):
        if device.device_path.startswith("/devices/virtual"):
            continue
        slotId = None
        if "SLOT_NAME" in device:
            slotId = device["SLOT_NAME"]
        elif "ID_VDEV" in device:
            slotId = device["ID_VDEV"]
        
        if slotId is not None:
            slotMap[slotId] = get_drive(device)
        elif args.include_non_aliased:
            nonAliased.append(get_drive(device))
    
    aliasedSlots = list(map(lambda x: {"slotId": x[0], "drive": x[1]}, slotMap.items()))

    return aliasedSlots + list(map(lambda drive: {"slotId": "unknown", "drive": drive}, nonAliased))


def report_initial(udev_ctx: pyudev.Context, args):
    message = {
        "type": "reportAll",
        "slots": get_slots(udev_ctx, args),
    }
    print(json.dumps(message, indent=None), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", default=False, required=False)
    parser.add_argument("--include-non-aliased", action="store_true", default=False, required=False)
    args = parser.parse_args()

    udev_ctx = pyudev.Context()

    if args.live:
        report_initial(udev_ctx, args)
        monitor_changes(udev_ctx, args)
    else:
        print(json.dumps(get_slots(udev_ctx, args)))


if __name__ == "__main__":
    main()
