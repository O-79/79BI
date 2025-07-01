import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Grid,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
  Paper,
  Tab,
  Tabs,
  CircularProgress,
  Chip,
  IconButton,
  Divider,
  SelectChangeEvent,
  ToggleButtonGroup,
  ToggleButton,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  ShowChart as LineChartIcon,
  TableChart as TableChartIcon,
  Code as CodeIcon,
  Title as TitleIcon,
  Subtitles as SubtitlesIcon,
  TextFormat as TextFormatIcon,
  TextFields as TextFieldsIcon,
  Storage as StorageIcon
} from '@mui/icons-material';
import { projectService } from '../services/projectService';
import { databaseConnectionService, DatabaseConnection } from '../services/databaseConnectionService';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { getAuthHeaders } from '../utils/authUtils';

// Define CreateTileDto interface to match the backend expected format
interface CreateTileDto {
  title: string;
  description?: string;
  // Backend only accepts these types
  type: 'chart' | 'text' | 'kpi';
  dashboardId: string;
  connectionId?: string;
  config?: TileConfig;
  position?: { x: number; y: number; w: number; h: number };
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tile-editor-tabpanel-${index}`}
      aria-labelledby={`tile-editor-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

interface DimensionField {
  fieldId: string;
  fieldName: string;
  aggregation?: string;
}

interface MeasureField {
  fieldId: string;
  fieldName: string;
  aggregation: string;
  alias?: string;
}

interface TextRow {
  id: string;
  type: 'header' | 'subheader' | 'text';
  content: string;
  isQuery: boolean;
}

interface TileConfig {
  // Backend only supports these chart types
  chartType?: 'bar' | 'line' | 'pie' | 'donut';
  dimensions?: DimensionField[];
  measures?: MeasureField[];
  textRows?: TextRow[];
  connectionId?: string;
  customQuery?: string;
  isQueryMode?: boolean;
  // Store the UI-specific tile type and chart type for front-end use
  uiType?: 'chart' | 'table' | 'metric' | 'text' | 'query';
  uiChartType?: 'bar' | 'line' | 'pie' | 'donut' | 'table';
  metadata?: {
    sqlQuery?: string;
    [key: string]: any;
  };
  sortBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  limit?: number;
  measure?: MeasureField;
}

interface DatabaseField {
  name: string;
  type: string;
  table: string;
  description?: string;
}

interface Tile {
  id: string;
  title: string;
  // Backend types
  type: 'chart' | 'text' | 'kpi';
  description?: string;
  connectionId?: string;
  config?: TileConfig;
  // UI can have additional types stored in config
}

interface TileEditorProps {
  open: boolean;
  onClose: () => void;
  tile?: Tile;
  dashboardId: string;
  onSave: () => void;
}

const TileEditor: React.FC<TileEditorProps> = ({
  open,
  onClose,
  tile,
  dashboardId,
  onSave
}) => {
  // Tab state
  const [tabValue, setTabValue] = useState(0);

  // Basic tile info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // UI-specific tile type
  const [tileType, setTileType] = useState<'chart' | 'table' | 'metric' | 'text' | 'query'>('chart');
  const [connectionId, setConnectionId] = useState('');
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie' | 'donut' | 'table'>('bar');

  // Text tile rows
  const [textRows, setTextRows] = useState<TextRow[]>([{
    id: '1',
    type: 'header',
    content: '',
    isQuery: false
  }]);

  // Query tile state
  const [isQueryMode, setIsQueryMode] = useState(false);
  const [customQuery, setCustomQuery] = useState('');

  // Connection and fields
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  // Track the selected connection object - needed for connection details
  const [selectedConnection, setSelectedConnection] = useState<DatabaseConnection | null>(null);
  const [databaseFields, setDatabaseFields] = useState<DatabaseField[]>([]);
  const [dimensions, setDimensions] = useState<DimensionField[]>([]);
  const [measures, setMeasures] = useState<MeasureField[]>([]);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Store mapping between field IDs and their source tables (needed for SQL generation)
  const [fieldTableMap, setFieldTableMap] = useState<Map<string, string>>(new Map());

  // Validation function
  const isValid = () => {
    // Basic validation
    if (!name.trim()) return false;
    
    // Type-specific validation
    if (tileType === 'chart' || tileType === 'table') {
      return connectionId && dimensions.length > 0 && measures.length > 0;
    } else if (tileType === 'metric') {
      return connectionId && measures.length > 0;
    } else if (tileType === 'text') {
      return textRows.length > 0 && textRows.some(row => row.content.trim());
    } else if (tileType === 'query') {
      if (isQueryMode) {
        return connectionId && customQuery.trim().length > 0;
      } else {
        return textRows.length > 0 && textRows.some(row => row.content.trim());
      }
    }
    
    return false;
  };

  // Load connections on mount
  useEffect(() => {
    const loadConnections = async () => {
      try {
        setLoading(true);
        const connList = await databaseConnectionService.getAllConnections();
        setConnections(connList.filter(conn => conn.status === 'active'));
        setLoading(false);
      } catch (error) {
        console.error('Failed to load database connections:', error);
        setError('Failed to load database connections');
        setLoading(false);
      }
    };

    if (open) {
      loadConnections();
    }
  }, [open]);

  // Initialize form when editing an existing tile
  useEffect(() => {
    if (!tile || !open) return;
    
    setName(tile.title || '');
    setDescription(tile.description || '');
    setTileType(tile.type || 'chart');
    
    if (tile.config) {
      setChartType(tile.config.chartType || 'bar');
      setDimensions(tile.config.dimensions || []);
      setMeasures(tile.config.measures || []);
      
      if (tile.connectionId) {
        setConnectionId(tile.connectionId);
      }

      if (tile.type === 'text' && tile.config.textRows) {
        setTextRows(tile.config.textRows);
      }
    }
  }, [tile, open]);
  
  // Load database fields when connection is selected
  useEffect(() => {
    if (connectionId) {
      loadConnectionSchema();
    } else {
      // Reset fields when no connection is selected
      setDatabaseFields([]);
      setFieldTableMap(new Map<string, string>());
    }
  }, [connectionId]);

  const loadConnectionSchema = async () => {
    if (!connectionId) return;
    
    try {
      setLoading(true);
      setError('');
      setDatabaseFields([]); // Clear previous fields
      
      const authHeaders = await getAuthHeaders();
      // Make sure to use the correct API_URL with http://localhost:3000
      const response = await axios.get(`http://localhost:3000/api/connections/${connectionId}/schema`, { headers: authHeaders });
      console.log('Schema response:', response.data);
      
      if (!response.data || response.data.error) {
        throw new Error(response.data?.error || 'Failed to fetch schema data');
      }
      
      // Extract fields from schema, handling different response formats
      let schemaData;
      if (response.data.success && response.data.data) {
        schemaData = response.data.data;
      } else if (response.data.schema) {
        schemaData = response.data.schema;
      } else {
        schemaData = response.data;
      }
      
      // Convert schema to a flat list of database fields
      const fields: DatabaseField[] = [];
      const fieldTableMapTemp = new Map<string, string>();
      
      // Based on the network response format you shared
      if (schemaData.schemas && schemaData.tables) {
        // Handle the specific format from your API
        const schemas = schemaData.schemas;
        const tables = schemaData.tables;
        
        // For each schema, process tables in sequence to avoid race conditions
        for (const schema of schemas) {
          // Get tables for this schema
          const schemaTables = tables[schema] || [];
          
          // For each table in this schema, process in sequence
          for (const tableName of schemaTables) {
            try {
              // Fetch table columns - using the correct API endpoint with full URL
              const columnsResponse = await axios.get(
                `http://localhost:3000/api/connections/${connectionId}/schema/${schema}/${tableName}`, 
                { headers: authHeaders }
              );
              
              if (columnsResponse.data.success && columnsResponse.data.data) {
                const columns = columnsResponse.data.data;
                const tableFields: DatabaseField[] = [];
                
                // Add each column as a field
                columns.forEach((column: any) => {
                  const field: DatabaseField = {
                    name: column.name || column.column_name,
                    type: column.type || column.data_type,
                    table: `${schema}.${tableName}`,
                    description: column.description || ''
                  };
                  
                  tableFields.push(field);
                  // Store the mapping for SQL generation
                  fieldTableMapTemp.set(field.name, field.table);
                });
                
                // Update state with the new fields
                fields.push(...tableFields);
              }
            } catch (err) {
              console.error(`Error loading columns for ${schema}.${tableName}:`, err);
              // Continue with other tables even if one fails
            }
          }
        }
        
        // After processing all tables, update the state once
        setDatabaseFields(fields);
        setFieldTableMap(fieldTableMapTemp);
      } else if (Array.isArray(schemaData)) {
        // Handle array of tables format
        schemaData.forEach((table: any) => {
          const tableName = table.name || table.table_name;
          if (table.columns) {
            table.columns.forEach((column: any) => {
              const field: DatabaseField = {
                name: column.name || column.column_name,
                type: column.type || column.data_type,
                table: tableName,
                description: column.description || ''
              };
              fields.push(field);
              fieldTableMapTemp.set(field.name, field.table);
            });
          }
        });
        setDatabaseFields(fields);
        setFieldTableMap(fieldTableMapTemp);
      } else if (typeof schemaData === 'object') {
        // Handle object format with tables as keys
        Object.keys(schemaData).forEach(tableName => {
          const columns = schemaData[tableName];
          if (Array.isArray(columns)) {
            columns.forEach(column => {
              const field: DatabaseField = {
                name: column.name || column.column_name,
                type: column.type || column.data_type,
                table: tableName,
                description: column.description || ''
              };
              fields.push(field);
              fieldTableMapTemp.set(field.name, field.table);
            });
          }
        });
        setDatabaseFields(fields);
        setFieldTableMap(fieldTableMapTemp);
      }
    } catch (err) {
      console.error('Error loading connection schema:', err);
      setError(`Failed to load database schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setDatabaseFields([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleChartTypeChange = (event: SelectChangeEvent) => {
    setChartType(event.target.value as 'bar' | 'line' | 'pie' | 'donut' | 'table');
  };

  const handleConnectionChange = (event: SelectChangeEvent) => {
    const connectionValue = event.target.value;
    setConnectionId(connectionValue);
    
    // Reset fields since the connection changed
    setDimensions([]);
    setMeasures([]);
    
    // Find and set the selected connection object
    if (connectionValue) {
      const connection = connections.find(c => c.id === connectionValue);
      if (connection) {
        setSelectedConnection(connection);
      } else {
        setSelectedConnection(null);
      }
    } else {
      setSelectedConnection(null);
    }
  };

  const handleAddDimension = (field: DatabaseField) => {
    const fieldId = `${field.table}.${field.name}`;
    const dimension: DimensionField = {
      fieldId,
      fieldName: field.name
    };
    
    // Check if field is already added
    if (!dimensions.some(d => d.fieldId === fieldId)) {
      setDimensions([...dimensions, dimension]);
      // Store table name for this field ID
      fieldTableMap.set(fieldId, field.table);
    }
  };

  const handleRemoveDimension = (index: number) => {
    const newDimensions = [...dimensions];
    newDimensions.splice(index, 1);
    setDimensions(newDimensions);
  };

  const handleAddMeasure = (field: DatabaseField) => {
    if (!isNumericField(field)) {
      // Only allow adding numeric fields as measures
      return;
    }
    
    // Check if measure already exists
    const exists = measures.some(m => m.fieldId === field.name);
    
    if (!exists) {
      const newMeasure: MeasureField = {
        fieldId: field.name,
        fieldName: field.name,
        aggregation: 'sum',
        alias: `${field.name}_sum` // Add alias property
      };
      
      setMeasures([...measures, newMeasure]);
      // Store table name for this field ID
      fieldTableMap.set(newMeasure.fieldId, field.table);
    }
  };

  const handleRemoveMeasure = (index: number) => {
    const newMeasures = [...measures];
    newMeasures.splice(index, 1);
    setMeasures(newMeasures);
  };

  const handleMeasureAggregationChange = (index: number, aggregation: string) => {
    setMeasures(prev => {
      const updated: MeasureField[] = [...prev];
      updated[index].aggregation = aggregation;
      return updated;
    });
  };

  // Functions for handling text tile rows
  const handleAddTextRow = () => {
    const newRow: TextRow = {
      id: uuidv4(), // Generate unique ID
      type: 'text',
      content: '',
      isQuery: false
    };
    
    setTextRows([...textRows, newRow]);
  };
  
  const handleTextRowContentChange = (id: string, content: string) => {
    setTextRows(textRows.map(row => 
      row.id === id ? { ...row, content } : row
    ));
  };
  
  const handleToggleRowQueryMode = (id: string) => {
    setTextRows(textRows.map(row => 
      row.id === id ? { ...row, isQuery: !row.isQuery } : row
    ));
  };
  
  const handleRemoveTextRow = (id: string) => {
    setTextRows(prev => prev.filter(row => row.id !== id));
  };
  
  const handleTextRowTypeChange = (id: string, type: 'header' | 'subheader' | 'text') => {
    setTextRows(prev => prev.map(row =>
      row.id === id ? { ...row, type } : row
    ));
  };
  
  const generateSqlQuery = (): string => {
    if (dimensions.length === 0 || measures.length === 0) {
      return '';
    }
    
    const tables = new Set<string>();
    const dimensionColumns: string[] = [];
    const measureColumns: string[] = [];
    
    // Collect tables and format columns
    dimensions.forEach(dim => {
      const table = fieldTableMap.get(dim.fieldId) || 'unknown_table';
      tables.add(table);
      dimensionColumns.push(`${table}.${dim.fieldName}`);
    });
    
    measures.forEach(measure => {
      const table = fieldTableMap.get(measure.fieldId) || 'unknown_table';
      tables.add(table);
      measureColumns.push(`${measure.aggregation}(${table}.${measure.fieldName}) as ${measure.alias || measure.fieldName}`);
    });
    
    // Build SQL query
    const tablesList = Array.from(tables);
    const selectClause = [...dimensionColumns, ...measureColumns].join(', ');
    const fromClause = tablesList[0]; // Start with first table
    const groupByClause = dimensionColumns.length > 0 ? `GROUP BY ${dimensionColumns.join(', ')}` : '';
    
    return `SELECT ${selectClause} \nFROM ${fromClause} \n${groupByClause}`;
  };

  // Helper function to check if a field is numeric for measure selection
  const isNumericField = (field: DatabaseField): boolean => {
    if (!field || !field.type) return false;
    const numericTypes = ['int', 'integer', 'number', 'float', 'double', 'decimal', 'numeric', 'bigint', 'smallint', 'real'];
    return numericTypes.some(type => field.type.toLowerCase().includes(type));
  };

  // Save the tile with proper type mapping between UI and backend
  const handleSave = async () => {
    if (!isValid()) {
      setError('Invalid tile configuration');
      setSaving(false);
      return;
    }
    setError('');
    setSaving(true);
    
    try {
      // Generate final config object based on tile type
      let config: TileConfig = {};
      
      switch (tileType) {
        case 'chart':
          config = {
            chartType, // Bar, line, pie, donut - already backend compatible
            dimensions,
            measures,
            uiType: 'chart', // Store original UI type
            metadata: {
              sqlQuery: generateSqlQuery()
            }
          };
          break;
        case 'table':
          // For table, we need to use a backend-compatible chartType
          // but store 'table' as uiChartType
          config = {
            chartType: 'bar', // Use a supported backend chart type
            uiChartType: 'table', // Store UI-specific chart type
            dimensions,
            measures,
            uiType: 'table', // Store original UI type
            metadata: {
              sqlQuery: generateSqlQuery()
            }
          };
          break;
        case 'metric':
          if (measures.length === 0) {
            setError('At least one measure is required for a metric tile');
            setSaving(false);
            return;
          }
          config = {
            measure: measures[0],
            uiType: 'metric', // Store original UI type
            metadata: {
              sqlQuery: generateSqlQuery()
            }
          };
          break;
        case 'text':
          config = { 
            textRows,
            uiType: 'text', // Store original UI type
            isQueryMode: false
          };
          break;
        case 'query':
          if (isQueryMode) {
            config = {
              customQuery,
              isQueryMode: true,
              uiType: 'query', // Store original UI type
              metadata: {
                sqlQuery: customQuery
              }
            };
          } else {
            config = { 
              textRows,
              uiType: 'query', // Store original UI type
              isQueryMode: false 
            };
          }
          break;
      }
      
      // Add connection ID to config if available
      if (connectionId) {
        config.connectionId = connectionId;
      }
      
      // Map UI tile type to backend-accepted type
      // Backend only accepts 'chart', 'text', 'kpi'
      let backendType: 'chart' | 'text' | 'kpi';
      switch (tileType) {
        case 'chart':
        case 'table':
          backendType = 'chart';
          break;
        case 'metric':
          backendType = 'kpi';
          break;
        case 'text':
        case 'query':
          backendType = 'text';
          break;
        default:
          backendType = 'chart'; // Default fallback
      }
      
      // Create tile data object with the mapped type
      const tileData: CreateTileDto = {
        title: name,
        description: description || undefined,
        type: backendType, // Use the mapped backend type
        dashboardId,
        connectionId: connectionId || undefined,
        config
      };
      
      console.log('Saving tile with data:', JSON.stringify(tileData, null, 2));
      
      // Create or update tile
      if (tile?.id) {
        // Update existing tile
        await projectService.updateTile(tile.id, tileData);
      } else {
        // Create new tile
        await projectService.createTile(tileData);
      }
      
      onSave();
      onClose();
    } catch (err) {
      console.error('Error saving tile:', err);
      setError(`Failed to save tile: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Get the appropriate icon for chart type
  const getChartIcon = (type: string) => {
    switch (type) {
      case 'bar':
        return <BarChartIcon />;
      case 'line':
        return <LineChartIcon />;
      case 'pie':
        return <PieChartIcon />;
      case 'donut':
        return <PieChartIcon />;
      default:
        return <BarChartIcon />;
    }
  };
  
  // These functions are already defined above
  // Removed duplicate declarations

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        {tile ? `Edit ${tile?.title || 'Tile'}` : 'Create New Tile'}
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="tile editor tabs">
            <Tab label="General" id="tile-editor-tab-0" aria-controls="tile-editor-tabpanel-0" />
            <Tab label="Data" id="tile-editor-tab-1" aria-controls="tile-editor-tabpanel-1" />
            <Tab label="Visualization" id="tile-editor-tab-2" aria-controls="tile-editor-tabpanel-2" />
          </Tabs>
        </Box>
        
        {/* General Tab */}
        <TabPanel value={tabValue} index={0}>
          <TextField
            autoFocus
            margin="dense"
            label="Tile Name"
            fullWidth
            variant="outlined"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            error={!name.trim()}
            helperText={!name.trim() ? 'Name is required' : ''}
            sx={{ mb: 2 }}
          />
          
          <TextField
            margin="dense"
            label="Description"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ mb: 2 }}
          />
          
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Tile Type</InputLabel>
                <Select
                  value={tileType}
                  onChange={(e) => setTileType(e.target.value as 'chart' | 'table' | 'metric' | 'text' | 'query')}
                  label="Tile Type"
                >
                  <MenuItem value="chart">Chart</MenuItem>
                  <MenuItem value="table">Table</MenuItem>
                  <MenuItem value="metric">Metric</MenuItem>
                  <MenuItem value="text">Text</MenuItem>
                  <MenuItem value="query">Free Text / Database Query</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth required={tileType !== 'text' && tileType !== 'query'} error={!connectionId && error !== '' && tileType !== 'text' && tileType !== 'query'}>
                <InputLabel>Database Connection</InputLabel>
                <Select
                  value={connectionId}
                  onChange={handleConnectionChange}
                  label="Database Connection"
                >
                  <MenuItem value="">
                    <em>Select a database connection</em>
                  </MenuItem>
                  {connections.map((connection) => (
                    <MenuItem key={connection.id} value={connection.id}>
                      {connection.name}
                    </MenuItem>
                  ))}
                </Select>
                {!connectionId && error && tileType !== 'text' && (
                  <FormHelperText>Please select a database connection</FormHelperText>
                )}
              </FormControl>
            </Grid>

            {tileType === 'chart' && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel id="chart-type-select-label">Chart Type</InputLabel>
                  <Select
                    labelId="chart-type-select-label"
                    id="chart-type-select"
                    value={chartType}
                    label="Chart Type"
                    onChange={handleChartTypeChange}
                    startAdornment={
                      <Box sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>
                        {getChartIcon(chartType)}
                      </Box>
                    }
                  >
                    <MenuItem value="bar">Bar Chart</MenuItem>
                    <MenuItem value="line">Line Chart</MenuItem>
                    <MenuItem value="pie">Pie Chart</MenuItem>
                    <MenuItem value="donut">Donut Chart</MenuItem>
                  </Select>
                  <FormHelperText>Select the type of visualization</FormHelperText>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </TabPanel>
        
        {/* Data Tab */}
        <TabPanel value={tabValue} index={1}>
          {tileType === 'query' ? (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isQueryMode}
                      onChange={(e) => setIsQueryMode(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Database Query Mode"
                />
                <Typography variant="caption" color="textSecondary" display="block">
                  {isQueryMode ? 'Write a custom SQL query' : 'Add formatted text content'}
                </Typography>
              </Grid>
              
              {isQueryMode ? (
                <Grid item xs={12}>
                  <FormControl fullWidth required={isQueryMode} error={isQueryMode && !customQuery.trim()}>
                    <TextField
                      label="SQL Query"
                      multiline
                      rows={8}
                      value={customQuery}
                      onChange={(e) => setCustomQuery(e.target.value)}
                      variant="outlined"
                      placeholder="SELECT * FROM table WHERE condition"
                      InputProps={{
                        sx: { fontFamily: 'monospace' }
                      }}
                    />
                    {isQueryMode && !customQuery.trim() && (
                      <FormHelperText>Please enter a SQL query</FormHelperText>
                    )}
                  </FormControl>
                </Grid>
              ) : (
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6">Text Content</Typography>
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      size="small"
                      onClick={handleAddTextRow}
                    >
                      Add Row
                    </Button>
                  </Box>
                  
                  {textRows.map((row) => (
                    <Paper
                      key={row.id}
                      variant="outlined"
                      sx={{ p: 2, mb: 2 }}
                    >
                      <Grid container spacing={2}>
                        {/* Row Controls */}
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <ToggleButtonGroup
                              value={row.type}
                              exclusive
                              onChange={(_, newType) => newType && handleTextRowTypeChange(row.id, newType as 'header' | 'subheader' | 'text')}
                              size="small"
                            >
                              <ToggleButton value="header">
                                <TitleIcon fontSize="small" />
                                <Typography variant="body2" sx={{ ml: 1 }}>
                                  Header
                                </Typography>
                              </ToggleButton>
                              <ToggleButton value="subheader">
                                <SubtitlesIcon fontSize="small" />
                                <Typography variant="body2" sx={{ ml: 1 }}>
                                  Subheader
                                </Typography>
                              </ToggleButton>
                              <ToggleButton value="text">
                                <TextFieldsIcon fontSize="small" />
                                <Typography variant="body2" sx={{ ml: 1 }}>
                                  Text
                                </Typography>
                              </ToggleButton>
                            </ToggleButtonGroup>
                            <IconButton
                              size="small"
                              onClick={() => handleRemoveTextRow(row.id)}
                              disabled={textRows.length <= 1}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Grid>
                        
                        {/* Content */}
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            multiline
                            rows={row.type === 'text' ? 4 : 1}
                            placeholder={`Enter ${row.type} content...`}
                            value={row.content}
                            onChange={(e) => handleTextRowContentChange(row.id, e.target.value)}
                            variant="outlined"
                          />
                        </Grid>
                      </Grid>
                    </Paper>
                  ))}
                </Grid>
              )}
            </Grid>
          ) : tileType === 'text' ? (
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">Text Content</Typography>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    size="small"
                    onClick={handleAddTextRow}
                  >
                    Add Row
                  </Button>
                </Box>
                
                {textRows.map((row) => (
                  <Paper
                    key={row.id}
                    variant="outlined"
                    sx={{ p: 2, mb: 2 }}
                  >
                    <Grid container spacing={2}>
                      {/* Row Controls */}
                      <Grid item xs={12}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <ToggleButtonGroup
                            value={row.type}
                            exclusive
                            onChange={(_, newType) => newType && handleTextRowTypeChange(row.id, newType as 'header' | 'subheader' | 'text')}
                            size="small"
                          >
                            <ToggleButton value="header">
                              <TitleIcon fontSize="small" />
                              <Typography variant="body2" sx={{ ml: 1 }}>
                                Header
                              </Typography>
                            </ToggleButton>
                            <ToggleButton value="subheader">
                              <SubtitlesIcon fontSize="small" />
                              <Typography variant="body2" sx={{ ml: 1 }}>
                                Subheader
                              </Typography>
                            </ToggleButton>
                            <ToggleButton value="text">
                              <TextFieldsIcon fontSize="small" />
                              <Typography variant="body2" sx={{ ml: 1 }}>
                                Text
                              </Typography>
                            </ToggleButton>
                          </ToggleButtonGroup>
                          
                          <Box>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={row.isQuery}
                                  onChange={() => handleToggleRowQueryMode(row.id)}
                                  size="small"
                                  disabled={!connectionId}
                                />
                              }
                              label={row.isQuery ? "SQL Query" : "Direct Text"}
                              labelPlacement="start"
                            />
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveTextRow(row.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </Box>
                      </Grid>
                      
                      {/* Content Input */}
                      <Grid item xs={12}>
                        {row.isQuery ? (
                          <TextField
                            label="SQL Query"
                            multiline
                            rows={4}
                            placeholder="SELECT column FROM table WHERE condition"
                            fullWidth
                            variant="outlined"
                            value={row.content}
                            onChange={(e) => handleTextRowContentChange(row.id, e.target.value)}
                            error={!connectionId}
                            helperText={!connectionId ? "Select a connection to enable SQL queries" : ""}
                            InputProps={{
                              startAdornment: <CodeIcon sx={{ mr: 1, color: 'text.secondary' }} />
                            }}
                          />
                        ) : (
                          <TextField
                            label={row.type.charAt(0).toUpperCase() + row.type.slice(1) + " Content"}
                            multiline
                            rows={row.type === 'header' ? 1 : row.type === 'subheader' ? 2 : 3}
                            placeholder={`Enter ${row.type} content here`}
                            fullWidth
                            variant="outlined"
                            value={row.content}
                            onChange={(e) => handleTextRowContentChange(row.id, e.target.value)}
                          />
                        )}
                      </Grid>
                      
                      {/* Preview of how the text will look */}
                      {row.content && !row.isQuery && (
                        <Grid item xs={12}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
                            Preview:
                          </Typography>
                          {row.type === 'header' && (
                            <Typography variant="h4">{row.content}</Typography>
                          )}
                          {row.type === 'subheader' && (
                            <Typography variant="h5">{row.content}</Typography>
                          )}
                          {row.type === 'text' && (
                            <Typography variant="body1">{row.content}</Typography>
                          )}
                        </Grid>
                      )}
                      
                      {/* SQL Query result preview */}
                      {row.isQuery && row.content && connectionId && (
                        <Grid item xs={12}>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<StorageIcon />}
                            onClick={() => {
                              // Logic to execute the SQL query and show results
                              console.log(`Execute query: ${row.content} on connection: ${connectionId}`);
                            }}
                          >
                            Test Query
                          </Button>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                ))}
                
                {textRows.length === 0 && (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                      No text rows added. Click "Add Row" to create content.
                    </Typography>
                  </Box>
                )}
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={3}>
              {/* For non-text tile types, show dimensions and measures */}
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Dimensions</Typography>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    {dimensions.length > 0 ? (
                      dimensions.map((dimension, index) => (
                        <Chip
                          key={index}
                          label={dimension.fieldName}
                          onDelete={() => handleRemoveDimension(index)}
                          sx={{ m: 0.5 }}
                        />
                      ))
                    ) : (
                      <Typography color="text.secondary">
                        No dimensions selected. Select fields from the list below.
                      </Typography>
                    )}
                  </Paper>

                  <Typography variant="subtitle2" gutterBottom>Available Fields</Typography>
                  <Paper variant="outlined" sx={{ p: 2, maxHeight: 200, overflow: 'auto' }}>
                    {databaseFields.map((field) => (
                      <Chip
                        key={field.name + field.table}
                        label={`${field.table}.${field.name}`}
                        onClick={() => handleAddDimension(field)}
                        sx={{ m: 0.5, cursor: 'pointer' }}
                        variant="outlined"
                      />
                    ))}
                    {databaseFields.length === 0 && (
                      <Typography color="text.secondary">
                        {loading ? 'Loading fields...' : 'Select a connection to view available fields'}
                      </Typography>
                    )}
                  </Paper>
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Measures</Typography>
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    {measures.length > 0 ? (
                      measures.map((measure, index) => (
                        <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                          <Chip
                            label={`${measure.aggregation}(${measure.fieldName})`}
                            onDelete={() => handleRemoveMeasure(index)}
                            sx={{ mr: 1 }}
                          />
                          <Select
                            value={measure.aggregation}
                            onChange={(e) => handleMeasureAggregationChange(index, e.target.value)}
                            size="small"
                            sx={{ minWidth: 100 }}
                          >
                            <MenuItem value="sum">Sum</MenuItem>
                            <MenuItem value="avg">Average</MenuItem>
                            <MenuItem value="min">Min</MenuItem>
                            <MenuItem value="max">Max</MenuItem>
                            <MenuItem value="count">Count</MenuItem>
                          </Select>
                        </Box>
                      ))
                    ) : (
                      <Typography color="text.secondary">
                        No measures selected. Select fields from the list below.
                      </Typography>
                    )}
                  </Paper>

                  <Typography variant="subtitle2" gutterBottom>Available Numeric Fields</Typography>
                  <Paper variant="outlined" sx={{ p: 2, maxHeight: 200, overflow: 'auto' }}>
                    {databaseFields.filter(isNumericField).map((field) => (
                      <Chip
                        key={field.name + field.table}
                        label={`${field.table}.${field.name}`}
                        onClick={() => handleAddMeasure(field)}
                        sx={{ m: 0.5, cursor: 'pointer' }}
                        variant="outlined"
                      />
                    ))}
                    {databaseFields.filter(isNumericField).length === 0 && (
                      <Typography color="text.secondary">
                        {loading ? 'Loading fields...' : 'No numeric fields available for measures'}
                      </Typography>
                    )}
                  </Paper>
                </Box>
              </Grid>

              {/* SQL Preview */}
              {dimensions.length > 0 && measures.length > 0 && connectionId && (
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>Generated SQL Preview</Typography>
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <pre style={{ whiteSpace: 'pre-wrap', overflow: 'auto' }}>
                      {generateSqlQuery()}
                    </pre>
                  </Paper>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Note: This is a preview of the SQL query that will be generated. Actual JOIN conditions will be determined based on foreign key relationships.
                  </Typography>
                </Grid>
              )}
            </Grid>
          )}
        </TabPanel>
        
        {/* Visualization Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ p: 3 }}>
            {/* Preview content */}
            <Typography variant="h6" gutterBottom>Preview</Typography>
            <Typography variant="body1">This is a preview of your tile.</Typography>
          </Box>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          color="primary"
          disabled={!isValid() || saving}
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TileEditor;
