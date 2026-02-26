WITH latest_block AS (
    SELECT 
        MAX(evt_block_number) AS latest_block_number
    FROM erc20_ethereum.evt_Transfer
    WHERE contract_address = 0x6b175474e89094c44da98b954eedeac495271d0f
),
block_info AS (
    SELECT 
        b.time AS synced_date,
        b.hash AS synced_hash,
        b.number AS synced_block_number
    FROM ethereum.blocks b
    CROSS JOIN latest_block lb
    WHERE b.number = lb.latest_block_number
)
SELECT
    evt_block_time AS date,
    value AS amount,
    evt_tx_from AS sender,
    evt_tx_hash AS tx_hash,
    bi.synced_date,
    bi.synced_hash,
    bi.synced_block_number
FROM erc20_ethereum.evt_Transfer
CROSS JOIN block_info bi
WHERE 
    contract_address = 0x6b175474e89094c44da98b954eedeac495271d0f
    AND "to" = 0x6b175474e89094c44da98b954eedeac495271d0f
ORDER BY date