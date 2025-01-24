import { ref} from 'vue';
import { legacy } from '@/index';
import type { basePoolData, NewDataset, newPoolData,newVDevData, PoolData } from './types';
//object for pool

const {useSpawn, errorString} = legacy;


const newPoolDisks = ref<string[]>([]);
const newVDevs = ref<newVDevData[]>([]);

const newVDevData = ref<newVDevData>({
	type: '',
	disks: [],
	isMirror: false,
});


//Function to run command to create new Pool
export async function newPool(pool: basePoolData | newPoolData): Promise<any> {
	try {
	  // Reset vdevs and pool disks
	   newVDevs.value = [];
	   newPoolDisks.value = [];
  
	  // Initialize base command
	  let cmdString = ['zpool', 'create'];
  
	  // Add common options
	  cmdString.push('-O', 'aclinherit=passthrough');
	  cmdString.push('-O', 'acltype=posixacl');
	  cmdString.push('-O', 'casesensitivity=sensitive');
	  cmdString.push('-O', 'normalization=formD');
	  cmdString.push(pool.name);
  
	  // Handle newPoolData-specific properties
	  if (isNewPoolData(pool)) {
		cmdString.push(
		  '-o', 'ashift=' + pool.sectorsize,
		  '-o', 'autoexpand=' + pool.autoexpand,
		  '-o', 'autoreplace=' + pool.autoreplace,
		  '-o', 'autotrim=' + pool.autotrim,
		  '-O', 'compression=' + pool.compression,
		  '-O', 'recordsize=' + pool.recordsize,
		  '-O', 'sharenfs=off',
		  '-O', 'sharesmb=off',
		  '-O', 'utf8only=on',
		  '-O', 'xattr=sa',
		  '-O', 'dedup=' + pool.dedup
		);
  
		if (pool.forceCreate) {
		  cmdString.push('-f');
		}
	  }
  
      if (pool.vdevs?.[0]?.type != 'disk') {
        // Safe to access pool.vdevs[0].type
      
              pool.vdevs.forEach(vDev => {
            if (vDev.isMirror && (vDev.type == 'special' || vDev.type == 'dedup' || vDev.type == 'log')) {
                cmdString.push(vDev.type);
                cmdString.push('mirror');
                vDev.disks.forEach(disk => {
                    if (typeof disk === 'string') {
                        cmdString.push(disk); // Push only strings
                    } else {
                        console.error('Unexpected DiskData:', disk);
                    }
                });
            } else {
                cmdString.push(vDev.type);
                vDev.disks.forEach(disk => {
                    if (typeof disk === 'string') {
                        cmdString.push(disk); // Push only strings
                    } else {
                        console.error('Unexpected DiskData:', disk);
                    }                });
            }
        });
        
    } else {
        pool.vdevs.forEach(vDev => {
            if (vDev.type == 'disk') {
                vDev.disks.forEach(disk => {
                    if (typeof disk === 'string') { // Ensure it's a string
                        if (!newPoolDisks.value.includes(disk)) {
                            newPoolDisks.value.push(disk);
                        }
                    } else {
                        console.error('Invalid disk type:', disk); // Handle unexpected types
                    }
                });
            } else if (vDev.type == 'cache' || vDev.type == 'log' || vDev.type == 'special' || vDev.type == 'spare' || vDev.type == 'dedup') {
                if ((vDev.type == 'log' || vDev.type == 'special' || vDev.type == 'dedup') && vDev.isMirror) {
                    newVDevData.value.type = vDev.type;
                    newVDevData.value.isMirror = true;
                    vDev.disks.forEach(disk => {
                        if (typeof disk === 'string') {
                            newVDevData.value.disks.push(disk);
                        }else{
                            console.error('Unexpected DiskData:', disk);
                        }
                    });
                    newVDevs.value.push(newVDevData.value);
                    newVDevData.value = {type: '', disks: [], isMirror: false};			
                } else {
                    newVDevData.value.type = vDev.type;
                    vDev.disks.forEach(disk => {
                        if (typeof disk === 'string') {
                            newVDevData.value.disks.push(disk);
                        }else{
                            console.error('Unexpected DiskData:', disk);
                        }                    });
                    newVDevs.value.push(newVDevData.value);
                    newVDevData.value = {type: '', disks: [], isMirror: false};
                }
            }
        });

        if (newPoolDisks.value.length > 0) {
            cmdString.push(...newPoolDisks.value);
            if (newVDevs.value.length > 0) {
                newVDevs.value.forEach(vDev => {
                    if (vDev.isMirror) {
                        cmdString.push(vDev.type);
                        cmdString.push('mirror');
                        cmdString.push(...vDev.disks);
                    } else {
                        cmdString.push(vDev.type);
                        cmdString.push(...vDev.disks);
                    }
                });
            }
        }
    }

  
	  console.log('****\ncmdstring:\n', ...cmdString, "\n****");
  
	  // Spawn process to execute command
	  const state = useSpawn(cmdString);
	  const output = await state.promise();
	  console.log(output);
	  return output.stdout;
	} catch (state) {
	  const errorMessage = errorString(state);
	  console.error(errorMessage);
	  return { error: errorMessage };
	}
  }
  
  // Type guard to check if pool is newPoolData
  function isNewPoolData(pool: basePoolData | newPoolData): pool is newPoolData {
	return 'sectorsize' in pool && 'compression' in pool;
  }

  export async function addVDev(pool:PoolData, vdev:newVDevData) {
    try {
      let cmdString = ['zpool', 'add'];
  
      if (vdev.forceAdd) {
        cmdString.push('-f');
      }
  
      cmdString.push(pool.name);
      if (vdev.type != 'disk') {
        cmdString.push(vdev.type);
      }
  
      if (vdev.isMirror) {
        cmdString.push('mirror');
      }
      
      //console.log('vdev.disks', vdev.disks);
      vdev.disks.forEach(disk => {
        //console.log(disk);
        cmdString.push(disk);
      });
  
      console.log('****\ncmdstring:\n', ...cmdString, "\n****");
  
      const state = useSpawn(cmdString);
      const output = await state.promise();
  
      console.log(output);
      return output.stdout;
  
    } catch (state) {
      // console.error(errorString(state));
      // return null;
      const errorMessage = errorString(state);
      console.error(errorMessage);
      return { error: errorMessage };
    }
  }
  export async function createDataset(fileSystemData : NewDataset) {
    try {
        let cmdString = ['zfs', 'create', '-o', 'atime=' + fileSystemData.atime, '-o', 'casesensitivity=' + fileSystemData.casesensitivity, '-o', 'compression=' + fileSystemData.compression, '-o', 'dedup=' + fileSystemData.dedup, '-o', 'dnodesize=' + fileSystemData.dnodesize, '-o', 'xattr=' + fileSystemData.xattr, '-o', 'recordsize=' + fileSystemData.recordsize, '-o', 'readonly=' + fileSystemData.readonly]
		
		
		if (Number(fileSystemData.quota) == 0) {
			cmdString.push('-o', 'quota=none');
		} else {
			cmdString.push('-o', 'quota=' + fileSystemData.quota);
		}

		cmdString.push(fileSystemData.parent + '/' + fileSystemData.name);

		console.log("create cmdString:" , cmdString);
		
		const state = useSpawn(cmdString);
		const output = await state.promise();
		console.log(output)
		return output.stdout;
		
	} catch (state) {
        console.error(errorString(state));
        return null;
    }
}