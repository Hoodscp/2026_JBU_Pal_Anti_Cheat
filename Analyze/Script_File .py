import ida_name
import ida_nalt
import struct
import os

def import_idmap(filepath):
    imagebase = ida_nalt.get_imagebase()
    
    with open(filepath, 'rb') as f:
        data = f.read()
    
    offset = 0
    count = 0
    
    while offset < len(data):
        if offset + 6 > len(data):
            break
            
        rva = struct.unpack_from('<I', data, offset)[0]
        offset += 4
        name_len = struct.unpack_from('<H', data, offset)[0]
        offset += 2
        
        if offset + name_len > len(data):
            break
            
        name = data[offset:offset+name_len].decode('utf-8', errors='ignore')
        offset += name_len
        
        ea = imagebase + rva
        ida_name.set_name(ea, name, ida_name.SN_FORCE)
        count += 1
    
    print(f"Done. {count} names imported.")

import_idmap(r"C:\Dumper-7\5.1.1-0+++UE5+Release-5.1-Pal\IDAMappings\5.1.1-0+++UE5+Release-5.1-Pal.idmap")#이부분을 본인 5.1.1-0+++UE5+Release-5.1-Pal.idmap가 있는 경로로 ㄱㄱ