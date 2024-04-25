import glob
import json

udev_rules = glob.glob('/etc/udev/**/*.rules')
print(json.dumps(udev_rules))
