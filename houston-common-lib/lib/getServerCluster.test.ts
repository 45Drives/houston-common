import { suite, test, expect } from "vitest";
import { _internal } from "./houston";

const pcsClusterConfigOutput = `{"cluster_name": "hacluster", "cluster_uuid": "8a916dffca8c419e9e8957b112f62382", "transport": "KNET", "totem_options": {}, "transport_options": {}, "compression_options": {}, "crypto_options": {"cipher": "aes256", "hash": "sha256"}, "nodes": [{"name": "192.168.45.13", "nodeid": "1", "addrs": [{"addr": "192.168.45.13", "link": "0", "type": "IPv4"}]}, {"name": "192.168.45.14", "nodeid": "2", "addrs": [{"addr": "192.168.45.14", "link": "0", "type": "IPv4"}]}], "links_options": {}, "quorum_options": {}, "quorum_device": null}`;

suite("getServerCluster('pcs')", () => {
  test("pcsNodesParseAddrs", () => {
    const result = _internal.pcsNodesParseAddrs(pcsClusterConfigOutput);
    expect(result.isOk()).toBe(true);
    result.map((addrs) => {
      expect(addrs).toEqual(["192.168.45.13", "192.168.45.14"]);
    });
  });
});
