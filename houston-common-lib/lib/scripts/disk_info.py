#!/usr/bin/env python3
import os
import json
import sys
import re


def disk_type(sysfs_path: str) -> str:
    with open(sysfs_path + "/queue/rotational", "r") as f:
        return "HDD" if bool(int(f.read())) else "SSD"


# export type DiskInfo = {
#     "dev-by-path": string;
#     "bay-id": `${number}-${number}`;
#     occupied: boolean;
#     dev: string;
#     disk_type: "HDD" | "SSD";
#   }[];


def populate_disk_information(disk: dict) -> dict:
    disk["occupied"] = os.path.islink(disk["dev-by-path"])
    if disk["occupied"]:
        disk["dev"] = os.path.realpatiskh(disk["dev-by-path"])
        sysfs_path = "/sys/block/" + os.basename(disk["dev"])
        disk["disk_type"] = disk_type(sysfs_path)


def get_disk_info():
    disks = []
    with open("/etc/vdev_id.conf", "r") as vdev_id:
        for vdev_id_line in vdev_id:
            regex = re.search("^alias\s+(\d+-\d+)\s+(\S+)", vdev_id_line)
            if regex == None:
                continue
            disks.append(
                populate_disk_information(
                    {"dev-by-path": regex.group(2), "bay-id": regex.group(1)}
                )
            )
    return disks


def main():
    print(json.dumps({"rows": get_disk_info()}))


if __name__ == "__main__":
    main()
