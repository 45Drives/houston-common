import { suite, test, expect } from "vitest";
import { _internal } from "./houston";

const pcsClusterConfigOutput = `{"cluster_name": "hacluster", "cluster_uuid": "8a916dffca8c419e9e8957b112f62382", "transport": "KNET", "totem_options": {}, "transport_options": {}, "compression_options": {}, "crypto_options": {"cipher": "aes256", "hash": "sha256"}, "nodes": [{"name": "192.168.45.13", "nodeid": "1", "addrs": [{"addr": "192.168.45.13", "link": "0", "type": "IPv4"}]}, {"name": "192.168.45.14", "nodeid": "2", "addrs": [{"addr": "192.168.45.14", "link": "0", "type": "IPv4"}]}], "links_options": {}, "quorum_options": {}, "quorum_device": null}`;


const corosyncConfContents = `totem {
  version: 2
  cluster_name: hacluster
  transport: knet
  crypto_cipher: aes256
  crypto_hash: sha256
}

nodelist {
  node {
      ring0_addr: 192.168.102.4
      name: 192.168.102.4
      nodeid: 1
  }

  node {
      ring0_addr: 192.168.102.5
      name: 192.168.102.5
      nodeid: 2
  }
}

quorum {
  provider: corosync_votequorum
  two_node: 1
}

logging {
  to_logfile: yes
  logfile: /var/log/corosync/corosync.log
  to_syslog: yes
  timestamp: on
}
`;

suite("getServerCluster('pcs')", () => {
  test("pcsNodesParseAddrs", () => {
    const result = _internal.pcsNodesParseAddrs(pcsClusterConfigOutput);
    expect(result.isOk()).toBe(true);
    result.map((addrs) => {
      expect(addrs).toEqual(["192.168.45.13", "192.168.45.14"]);
    });
  });

  test("parseCorosyncConfNodeIps", () => {
    expect(_internal.parseCorosyncConfNodeIps(corosyncConfContents)).toEqual(["192.168.102.4", "192.168.102.5"])
  })
});
